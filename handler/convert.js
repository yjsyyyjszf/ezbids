#!/usr/bin/env node
"use strict";
const fs = require('fs');
const mkdirp = require('mkdirp');
const async = require('async');
const root = process.argv[2];
if (!root)
    throw "please specify root directory";
const json = fs.readFileSync(root + "/finalized.json");
const info = JSON.parse(json);
mkdirp.sync(root + "/bids");
fs.writeFileSync(root + "/bids/dataset_description.json", JSON.stringify(info.datasetDescription, null, 4));
fs.writeFileSync(root + "/bids/README.md", info.readme);
fs.writeFileSync(root + "/bids/participants.json", JSON.stringify(info.participantsColumn, null, 4));
//convert participants.json to tsv
console.log("outputting participants.json/tsv");
let keys = [];
for (let subject in info.participants) {
    let rec = info.participants[subject];
    for (let key in rec) {
        if (!keys.includes(key))
            keys.push(key);
    }
}
let tsv = [];
let tsvheader = [];
for (let key of keys) {
    tsvheader.push(key);
}
tsv.push(tsvheader);
for (let subject in info.participants) {
    let rec = info.participants[subject];
    let tsvrec = [];
    for (let key of keys) {
        tsvrec.push(rec[key]);
    }
    tsv.push(tsvrec);
}
let tsvf = fs.openSync(root + "/bids/participants.tsv", "w");
for (let rec of tsv) {
    fs.writeSync(tsvf, rec.join(",") + "\n");
}
fs.closeSync(tsvf);
//handle each objects
console.log("outputting objects");
async.forEach(info.objects, (o, next_o) => {
    if (!o.include)
        return next_o();
    let typeTokens = o.type.split("/");
    let modality = typeTokens[0]; //func, dwi, anat, etc..
    let suffix = typeTokens[1];
    //setup directory
    let path = "bids";
    path += "/sub-" + o.entities.sub;
    if (o.entities.ses)
        path += "/ses-" + o.entities.ses;
    path += "/" + modality;
    mkdirp.sync(root + "/" + path);
    //construct basename
    let tokens = [];
    for (let k in o.entities) {
        if (o.entities[k])
            tokens.push(k + "-" + o.entities[k]);
    }
    const name = tokens.join("_");
    function handleItem(item, filename) {
        let goback = "";
        for (let i = 0; i < path.split("/").length; ++i) {
            goback += "../";
        }
        let fullpath = root + "/" + path + "/" + name + "_" + filename;
        //console.log(item.name, fullpath);
        if (item.name == "json") {
            //we create sidecar from sidecar object (edited by the user)
            fs.writeFileSync(fullpath, JSON.stringify(item.sidecar));
        }
        else {
            //assume to be normal files
            try {
                fs.lstatSync(fullpath);
                fs.unlinkSync(fullpath);
            }
            catch (err) {
                //console.log("link doesn't exist yet");
            }
            //I need to use hardlink so that when archiver tries to create .zip in download API
            //the files will be found. As far as I know, archiver module can't de-reference 
            //symlinks
            //fs.symlinkSync(goback+item.path, fullpath);
            fs.linkSync(root + "/" + item.path, fullpath);
        }
    }
    switch (modality) {
        case "anat":
            /*
            - suffixes:
                - T1w
                - T2w
                - T1rho
                - T1map
                - T2map
                - T2star
                - FLAIR
                - FLASH
                - PD
                - PDmap
                - PDT2
                - inplaneT1
                - inplaneT2
                - angio
            */
            o.items.forEach(item => {
                switch (item.name) {
                    case "nii.gz":
                        handleItem(item, suffix + ".nii.gz");
                        break;
                    case "json":
                        handleItem(item, suffix + ".json");
                        break;
                    default:
                        console.error("unknown anat item name", item.name);
                }
            });
            break;
        case "func":
            /*
            - suffixes:
                - bold
                - cbv
                - phase
                - sbref
    
            */
            o.items.forEach(item => {
                switch (item.name) {
                    case "nii.gz":
                        handleItem(item, suffix + ".nii.gz");
                        break;
                    case "json":
                        handleItem(item, suffix + ".json");
                        break;
                    default:
                        console.error("unknown func item name", item.name);
                }
            });
            break;
        case "fmap":
            /*
            - suffixes:
                - phasediff
                - phase1
                - phase2
                - magnitude1
                - magnitude2
                - magnitude
                - fieldmap
            */
            o.items.forEach(item => {
                switch (item.name) {
                    case "nii.gz":
                        handleItem(item, suffix + ".nii.gz");
                        break;
                    case "json":
                        //handle IntendedFor
                        if (o.IntendedFor) {
                            item.sidecar.IntendedFor = [];
                            for (let idx in o.IntendedFor) {
                                const io = info.objects[parseInt(idx)];
                                const iomodality = io.type.split("/")[0];
                                const suffix = io.type.split("/")[1];
                                //const ioitem = io.items.find(_o=>_o.name == "nii.gz");
                                //construct a path relative to the subject
                                let path = "";
                                if (io.entities.ses)
                                    path += "ses-" + io.entities.ses;
                                "/";
                                path += iomodality + "/";
                                let tokens = [];
                                for (let k in io.entities) {
                                    if (io.entities[k])
                                        tokens.push(k + "-" + io.entities[k]);
                                }
                                path += tokens.join("_");
                                path += "_" + suffix + ".nii.gz"; //TODO - not sure if this is robust enough..
                                item.sidecar.IntendedFor.push(path);
                            }
                        }
                        handleItem(item, suffix + ".json");
                        break;
                    default:
                        console.error("unknown fmap item name", item.name);
                }
            });
            break;
        case "dwi":
            o.items.forEach(item => {
                switch (item.name) {
                    case "nii.gz":
                        handleItem(item, "dwi.nii.gz");
                        break;
                    case "bvec":
                        handleItem(item, "dwi.bvec");
                        break;
                    case "bval":
                        handleItem(item, "dwi.bval");
                        break;
                    case "json":
                        handleItem(item, "dwi.json");
                        break;
                    default:
                        console.error("unknown dwi item name", item.name);
                }
            });
            break;
        default:
            console.error("unknown datatype:" + o.type);
    }
    next_o();
});
//# sourceMappingURL=convert.js.map