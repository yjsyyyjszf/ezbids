import Vue from 'vue'

var numeral = require("numeral");
Vue.filter("formatNumber", value=>{
    return numeral(value).format("0,0"); // displaying other groupings/separators is possible, look at the docs
});

import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import locale from 'element-ui/lib/locale/lang/en'
Vue.use(ElementUI, { locale } );

import jsyaml from 'js-yaml';

import Vuex from 'vuex'
Vue.use(Vuex)

if(process.env.NODE_ENV == "development") {
    Vue.config.debug = true;
}

Vue.config.productionTip = false

import App from './App.vue'

new Vue({
    el: '#app',
    components: {
        App,
    },
    render(createElement) {
        return createElement('App');
    },
    
    //router,
    data() {

        //
        //$root scope............................................
        //
        return {
            apihost: (process.env.NODE_ENV == "development") ? "https://dev1.soichi.us/api/easybids" : "/api/ezbids",

            //data from dan's script
            //site: "", 
            datasetDescription: {
                "Name": "",
                "BIDSVersion": "1.4.0",
                "DatasetType": "raw",
                "License": "CC0",
                "Authors": [
                    "Soichi Hayashi",
                    "Dan Levitas"
                ],
                "Acknowledgements": "", //"Special thanks to Korbinian Brodmann for help in formatting this dataset in BIDS. We thank Alan Lloyd Hodgkin and Andrew Huxley for helpful comments and discussions about the experiment and manuscript; Hermann Ludwig Helmholtz for administrative support; and Claudius Galenus for providing data for the medial-to-lateral index analysis.",
                "HowToAcknowledge": "", //"Please cite this paper: https://www.ncbi.nlm.nih.gov/pubmed/001012092119281",
                "Funding": [
                    //"National Institute of Neuroscience Grant F378236MFH1",
                    //"National Institute of Neuroscience Grant 5RMZ0023106"
                ],
                "EthicsApprovals": [
                    //"Army Human Research Protections Office (Protocol ARL-20098-10051, ARL 12-040, and ARL 12-041)"
                ],
                "ReferencesAndLinks": [
                    //"https://www.ncbi.nlm.nih.gov/pubmed/001012092119281",
                    //"http://doi.org/1920.8/jndata.2015.7"
                ],
                "DatasetDOI": "", //"10.0.2.3/dfjj.10"
            },
            readme: "", 
            //participants: {},
            participantsColumn: {},
            
            subjects: [],
            sessions: [],
            series: [],

            objects: [],
            subs: {}, //objects organized into subs/ses/run for objects page

            page: "upload",

            //TODO - deprecated - use bids_datatypes (datatype selector should be componentized)
            datatypes: [], //datatype catalog from bids-specification (suffixes only)

            bids_datatypes: {},  //keyed by modality (dwi, anat, then the content of the yaml)
            bids_entities: null,  //keybed by entities, and info for each entities

            uploadFailed: false,

            session: null, //created when upload begins
            //session.status... 
            //      created
            //      uploaded
            //      preprocessing
            //      analyzed
            //      failed
            //      finalized
            //      bidsing
            //      finished

            analyzed: false,
            validated: false,
            finalized: false,
            //finalized: false,
            //finished: false,
        }
    },

    watch: {
        page(v) {
            if(v == "objects") {
                this.organizeObjects();

                //TODO - we need to ask user if they want to override any changes they might have made already on objects
                this.objects.forEach(object=>{

                    //apply series info (I wish we can apply this information at finalize stage, but that means we have to create separate include/type field
                    //for object level that *overrides* series mapping.. a bit tricky?)
                    let series = this.findSeries(object);
                    if(!series) {
                        console.log("unknown seriesnumber in object", object.SeriesDescription);
                    } else {
                        object.include = series.include;
                        object.type = series.type;
                    }

                    //for each object in a given session
                    for(let sub in this.subs) {
                        for(let ses in this.subs[sub].sess) {
                            const objects = this.subs[sub].sess[ses].objects;
                            objects.forEach(o=>{
                                
                                //look for series.IntendedFor and find those series within sub/ses group (sibling objects)
                                o.IntendedFor = {}; 
                                const series = this.findSeries(o);
                                if(series.IntendedFor) {
                                    series.IntendedFor.forEach(sidx=>{
                                        const s = this.series[sidx];
                                        this.objects.filter(so=>this.findSeries(so) == s).forEach(so=>{
                                            let oidx = this.objects.indexOf(so);
                                            o.IntendedFor[oidx.toString()] = true;
                                        });
                                    });
                                }
                            });
                        }
                    }

                    this.validateObject(object);
                });

                this.validated = this.isAllValid(); 
            }
        },
    },

    async mounted() {
        console.log("mounted main");

        if(location.hash) {
            console.log("reloading session");
            this.session = {
                _id: location.hash.substring(1),
            }
            this.pollSession();
            console.dir(this.session);
        }

        //dwi
        //https://github.com/tsalo/bids-specification/blob/ref/json-entity/src/schema/datatypes/dwi.yaml
        let _dwi = jsyaml.load(`
- suffixes:
    - dwi
  extensions:
    - .nii.gz
    - .nii
    - .json
    - .bvec
    - .bval
  entities:
    sub: required
    ses: optional
    acq: optional
    dir: optional
    run: optional
- suffixes:
    - sbref
  extensions:
    - .nii.gz
    - .nii
    - .json
  entities:
    sub: required
    ses: optional
    acq: optional
    dir: optional
    run: optional
`);
        this.bids_datatypes["dwi"] = _dwi;

        let dwi = {label: "Diffusion", options: []}
        _dwi.forEach(group=>{
            group.suffixes.forEach(suffix=>{
                dwi.options.push({value: "dwi/"+suffix, label: suffix});
            });
        });
        this.datatypes.push(dwi);
        
        //anat
        //https://github.com/tsalo/bids-specification/blob/ref/json-entity/src/schema/datatypes/anat.yaml
        let _anat = jsyaml.load(`
# First group
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
  extensions:
    - .nii.gz
    - .nii
    - .json
  entities:
    sub: required
    ses: optional
    run: optional
    acq: optional
    ce: optional
    rec: optional
# Second group
- suffixes:
    - defacemask
  extensions:
    - .nii.gz
    - .nii
    - .json
  entities:
    sub: required
    ses: optional
    run: optional
    acq: optional
    ce: optional
    rec: optional
    mod: optional
`);
        this.bids_datatypes["anat"] = _anat;

        let anat = {label: "Anatomical", options: []}
        _anat.forEach(group=>{
            group.suffixes.forEach(suffix=>{
                anat.options.push({value: "anat/"+suffix, label: suffix});
            });
        });
        this.datatypes.push(anat);

        //https://github.com/tsalo/bids-specification/blob/ref/json-entity/src/schema/datatypes/func.yaml
        let _func = jsyaml.load(`
- suffixes:
    - bold
    - cbv
    - phase
    - sbref
  extensions:
    - .nii.gz
    - .nii
    - .json
  entities:
    sub: required
    ses: optional
    task: required
    acq: optional
    ce: optional
    rec: optional
    dir: optional
    run: optional
    echo: optional
- suffixes:
    - events
  extensions:
    - .tsv
    - .json
  entities:
    sub: required
    ses: optional
    task: required
    acq: optional
    ce: optional
    rec: optional
    dir: optional
    run: optional
    echo: optional
- suffixes:
    - physio
    - stim
  extensions:
    - .tsv.gz
    - .json
  entities:
    sub: required
    ses: optional
    task: required
    acq: optional
    rec: optional
    run: optional
    recording: optional
    proc: optional
`);
        this.bids_datatypes["func"] = _func;

        let func = {label: "Functional", options: []}
        _func.forEach(group=>{
            group.suffixes.forEach(suffix=>{
                func.options.push({value: "func/"+suffix, label: suffix});
            });
        });
        this.datatypes.push(func);

        //https://github.com/tsalo/bids-specification/blob/ref/json-entity/src/schema/datatypes/fmap.yaml
        let _fmap = jsyaml.load(`
- suffixes:
    - phasediff
    - phase1
    - phase2
    - magnitude1
    - magnitude2
    - magnitude
    - fieldmap
  extensions:
    - .nii.gz
    - .nii
    - .json
  entities:
    sub: required
    ses: optional
    acq: optional
    run: optional
- suffixes:
    - epi
  extensions:
    - .nii.gz
    - .nii
    - .json
  entities:
    sub: required
    ses: optional
    acq: optional
    ce: optional
    dir: required
    run: optional
`);
        this.bids_datatypes["fmap"] = _fmap;

        let fmap = {label: "Field Map", options: []}
        _fmap.forEach(group=>{
            group.suffixes.forEach(suffix=>{
                fmap.options.push({value: "fmap/"+suffix, label: suffix});
            });
        });
        this.datatypes.push(fmap);

        this.bids_entities = jsyaml.load(`
sub:
  name: Subject
  description: "A person or animal participating in the study."
  format: label
ses:
  name: Session
  description: |
    A logical grouping of neuroimaging and behavioral data consistent across subjects.
    Session can (but doesn't have to) be synonymous to a visit in a longitudinal study.
    In general, subjects will stay in the scanner during one session.
    However, for example, if a subject has to leave the scanner room and then be
    re-positioned on the scanner bed, the set of MRI acquisitions will still be considered
    as a session and match sessions acquired in other subjects.
    Similarly, in situations where different data types are obtained over several visits
    (for example fMRI on one day followed by DWI the day after) those can be grouped in one
    session.
    Defining multiple sessions is appropriate when several identical or similar data
    acquisitions are planned and performed on all -or most- subjects, often in the case of
    some intervention between sessions (e.g., training).
  format: label
task:
  name: Task
  format: label
  description: "Each task has a unique label that MUST only consist of letters
                and/or numbers (other characters, including spaces and
                underscores, are not allowed).
                Those labels MUST be consistent across subjects and sessions."
acq:
  name: Acquisition
  description: "The OPTIONAL acq-<label> key/value pair corresponds to a custom
                label the user MAY use to distinguish a different set of
                parameters used for acquiring the same modality.
                For example this should be used when a study includes two T1w
                images - one full brain low resolution and and one restricted
                field of view but high resolution. In such case two files could
                have the following names: sub-01_acq-highres_T1w.nii.gz and
                sub-01_acq-lowres_T1w.nii.gz, however the user is free to choose
                any other label than highres and lowres as long as they are
                consistent across subjects and sessions. In case different
                sequences are used to record the same modality (e.g. RARE and
                FLASH for T1w) this field can also be used to make that distinction.
                At what level of detail to make the distinction (e.g. just between
                RARE and FLASH, or between RARE, FLASH, and FLASHsubsampled)
                remains at the discretion of the researcher."
  format: label
ce:
  name: Contrast Enhancing Agent
  description: "Similarly the OPTIONAL ce-<label> key/value can be used to
                distinguish sequences using different contrast enhanced images.
                The label is the name of the contrast agent.
                The key ContrastBolusIngredient MAY be also be added in the JSON
                file, with the same label."
  format: label
rec:
  name: Reconstruction
  description: "Similarly the OPTIONAL rec-<label> key/value can be used to
                distinguish different reconstruction algorithms (for example
                ones using motion correction)."
  format: label
dir:
  name: Phase-Encoding Direction
  description: "Similarly the OPTIONAL dir-<label> key/value can be used to
                distinguish different phase-encoding directions."
  format: label
run:
  name: Run
  description: "If several scans of the same modality are acquired they MUST be
                indexed with a key-value pair: _run-1, _run-2, _run-3 etc.
                (only integers are allowed as run labels).
                When there is only one scan of a given type the run key MAY be
                omitted.
                Please note that diffusion imaging data is stored elsewhere
                (see below)."
  format: index
mod:
  name: Corresponding Modality
  description: "In such cases the OPTIONAL mod-<label> key/value pair corresponds
                to modality label for eg: T1w, inplaneT1, referenced by a
                defacemask image. E.g., sub-01_mod-T1w_defacemask.nii.gz."
  format: label
echo:
  name: Echo
  description: "Multi-echo data MUST be split into one file per echo.
                Each file shares the same name with the exception of the
                _echo-<index> key/value."
  format: index
recording:
  name: Recording
  description: "More than one continuous recording file can be included (with
                different sampling frequencies).
                In such case use different labels.
                For example: _recording-contrast, _recording-saturation."
  format: label
proc:
  name: Processed (on device)
  description: "The proc label is analogous to rec for MR and denotes a variant
                of a file that was a result of particular processing performed
                on the device.
                This is useful for files produced in particular by Elekta’s
                MaxFilter (e.g. sss, tsss, trans, quat, mc, etc.), which some
                installations impose to be run on raw data because of active
                shielding software corrections before the MEG data can actually
                be exploited."
  format: label
space:
  name: Space
  description: "The optional space label (*[_space-<label>]_electrodes.tsv) can
                be used to indicate the way in which electrode positions are interpreted.
                The space label needs to be taken from the list in Appendix VIII"
  format: label
split:
  name: Split
  description: "In the case of long data recordings that exceed a file size of
                2Gb, the .fif files are conventionally split into multiple parts.
                Each of these files has an internal pointer to the next file.
                This is important when renaming these split recordings to the BIDS
                convention.
                Instead of a simple renaming, files should be read in and saved
                under their new names with dedicated tools like MNE, which will
                ensure that not only the file names, but also the internal file
                pointers will be updated.
                It is RECOMMENDED that .fif files with multiple parts use the
                split-<index> entity to indicate each part."
  format: index
`);

    },

    computed: {
        /*
        validated() {
            console.log("testing validation");
            if(this.objects.length == 0) return false; //empty!
            for(let object in this.objects) {
                if(!object.validationErrors) return false; //not validated yet?
                if(object.validationErrors.length > 0) return false;
            }
            console.log("objects are valid");
            return true; //all good
        }
        */
    },

    methods: {
        reset() {
            /*
            this.datasetDescription = {
                "Name": "The mother of all experiments",
                "BIDSVersion": "1.4.0",
                "DatasetType": "raw",
                "License": "CC0",
                "Authors": [
                    "Paul Broca",
                    "Carl Wernicke"
                ],
                "Acknowledgements": "Special thanks to Korbinian Brodmann for help in formatting this dataset in BIDS. We thank Alan Lloyd Hodgkin and Andrew Huxley for helpful comments and discussions about the experiment and manuscript; Hermann Ludwig Helmholtz for administrative support; and Claudius Galenus for providing data for the medial-to-lateral index analysis.",
                "HowToAcknowledge": "Please cite this paper: https://www.ncbi.nlm.nih.gov/pubmed/001012092119281",
                "Funding": [
                    "National Institute of Neuroscience Grant F378236MFH1",
                    "National Institute of Neuroscience Grant 5RMZ0023106"
                ],
                "EthicsApprovals": [
                    "Army Human Research Protections Office (Protocol ARL-20098-10051, ARL 12-040, and ARL 12-041)"
                ],
                "ReferencesAndLinks": [
                    "https://www.ncbi.nlm.nih.gov/pubmed/001012092119281",
                    "http://doi.org/1920.8/jndata.2015.7"
                ],
                "DatasetDOI": "10.0.2.3/dfjj.10"
            };

            this.readme = "";
            this.participantsColumn = {};
            
            this.subjects = [];
            this.sessions = [];
            this.series = [];

            this.objects = [];
            this.subs = {};

            this.page = "upload";
            this.uploadFailed = false;
            this.session = null;
            this.analyzed = false;
            this.validated = false;
            this.finalized = false;
            this.finished = false;
            */
            location.hash = "";
            location.reload();
        },
        
        //TODO - I should rename this to getDatatypeEntities()
        //same code in series / methods
        getEntities(type) {
            const modality = type.split("/")[0];
            const suffix = type.split("/")[1];
            let datatype = this.bids_datatypes[modality];
            if(!datatype) return {};

            let entities = {};
            datatype.forEach(b=>{
                if(b.suffixes.includes(suffix)) Object.assign(entities, b.entities);
            });
            return entities;
        },

        findSubject(o) {
            let subject = this.subjects.find(s=>{
                if(o.PatientName) {
                    if(s.PatientName == o.PatientName) return true;
                    return false;
                }
                if(o.PatientID) {
                    if(s.PatientID == o.PatientID) return true;
                    return false;
                }
                if(o.PatientBirthDate) {
                    if(s.PatientBirthDate == o.PatientBirthDate) return true;
                    return false;
                }
                return false;
            });
            return subject;
        },

        findSession(o) {
            let session = this.sessions.find(s=>s.AcquisitionDate == o.AcquisitionDate);
            return session;
        },

        findSeries(o) {
            let series = this.series.find(s=>{
                if(s.SeriesDescription == o.SeriesDescription/* && s.SeriesNumber == o.SeriesNumber*/) return true;
                return false;
            });
            return series;
        },

        validateObject(o) {
            Vue.set(o, 'validationErrors', []);

            if(!o.type) {
                o.validationErrors.push("Please select a datatype");
                return;
            }

            //make sure all required entities are set
            let series = this.findSeries(o);
            let entities_requirement = this.getEntities(o.type);

            switch(o.type) {
            case "func/bold":
                if(entities_requirement['task'] && !o.entities.task && !series.entities.task) o.validationErrors.push("Task Name is required for func/bold but not set in series nor overridden.");
            }

            //try parsing items
            o.items.forEach(item=>{
                if(item.sidecar) {
                    try {
                        item.sidecar = JSON.parse(item.sidecar_json);
                    } catch (err) {
                        o.validationErrors.push(err);
                    }
                }
            });
        },

        isAllValid() {
            console.log("checking valid");
            for(let o of this.objects) {
                if(!o.include) continue;
                if(o.validationErrors.length > 0) {
                    console.log("no good");
                    return false;
                }
            }
            console.log("all good");
            return true;
        },

        organizeObjects() {
            console.log("reorging");
            this.subs = {}; 

            this.objects.forEach(o=>{
                let subject = this.findSubject(o);
                if(!subject) console.error("couldn't find subject mapping for", o);
                let sub = subject.sub;
                if(o.entities.sub) sub = o.entities.sub; //apply override

                let session = this.findSession(o);
                if(!session) console.error("couldn't find session mapping for", o);
                let ses = session.ses;
                if(o.entities.ses) ses = o.entities.ses; //apply override

                //let run = o.entities.run||"";

                if(!this.subs[sub]) this.subs[sub] = { sess: {}, objects: []}; 
                this.subs[sub].objects.push(o);

                if(!this.subs[sub].sess[ses]) this.subs[sub].sess[ses] = { /*runs: {},*/ objects: [] };
                this.subs[sub].sess[ses].objects.push(o);

                //if(!this.subs[sub].sess[ses].runs[run]) this.subs[sub].sess[ses].runs[run] = { objects: [] };
                //this.subs[sub].sess[ses].runs[run].objects.push(o);
            });

            this.objects.sort((a,b)=>{
                let aSubject = this.findSubject(a);
                let bSubject = this.findSubject(b);
                let asub = aSubject.sub;
                let bsub = bSubject.sub;
                if(a.entities.sub) asub = a.entities.sub;
                if(b.entities.sub) bsub = b.entities.sub;
                if(asub > bsub) return 1;
                if(asub < bsub) return -1;

                if(a.entities.ses > b.entities.ses) return 1;
                if(a.entities.ses < b.entities.ses) return -1;
                if(a.entities.run > b.entities.run) return 1;
                if(a.entities.run < b.entities.run) return -1;
                return 0;
            });
        },

        loadData(url) {
            console.log("loadData", url);
            return fetch(url).then(res=>res.json()).then(conf=>{
                //this.site = conf.site;
                 
                this.subjects = conf.subjects;
                this.sessions = conf.sessions;
                this.series = conf.series;
                this.objects = conf.objects;

                this.participantsColumn = conf.participantsColumn||{};

                //debug migration
                /*
                this.objects.forEach(object=>{
                    object.entities = object.labels||{};
                    delete object.labels;
                    if(object.hierarchy) {
                        if(object.hierarchy.subject) object.entities.sub = object.hierarchy.subject;
                        if(object.hierarchy.session) object.entities.ses = object.hierarchy.session;
                        if(object.hierarchy.run) object.entities.run = object.hierarchy.run;
                        delete object.hierarchy;
                    }
                });
                this.series.forEach(series=>{
                    series.entities = series.labels||{};
                    delete series.labels;
                    if(s.hierarchy) {
                        if(s.hierarchy.subject) s.entities.sub = s.hierarchy.subject;
                        if(s.hierarchy.session) s.entities.ses = s.hierarchy.session;
                        if(s.hierarchy.run) s.entities.run = s.hierarchy.run;
                        delete s.hierarchy;
                    }
                });
                */
                this.series.forEach(series=>{
                    delete series.entities.sub;
                    delete series.entities.ses;
                    delete series.entities.run;
                });

                this.subjects.forEach(subject=>{
                    Vue.set(subject, 'phenotype', {});
                });
                this.objects.forEach(object=>{
                    object.items.forEach(item=>{
                        if(item.sidecar) {

                            //anonymize..
                            let sidecar = Object.assign({}, item.sidecar);
                            delete sidecar.PatientName;
                            delete sidecar.PatientID;

                            Vue.set(item, 'sidecar_json', JSON.stringify(sidecar, null, 4));
                        }
                    });
                });

                this.series.sort((a,b)=>a.SeriesNumber - b.SeriesNumber);
            }).catch(err=>{
                console.error("failed to load", url);
                console.error(err);
            });
        },

        async pollSession() {
            console.log("polling..", this.session.status);
            const res = await fetch(this.apihost+'/session/'+this.session._id, {
                method: "GET",
                headers: { 'Content-Type': 'application/json' },
            });
            this.session = await res.json();

            switch(this.session.status) {
            case "created":
            case "uploaded":
            case "preprocessing":
            case "finalized":
            case "bidsing":
                this.reload_t = setTimeout(()=>{
                    console.log("will reload");
                    this.pollSession();
                }, 1000);
                break;

            case "analyzed":
                if(!this.analyzed) {
                    await this.loadData(this.apihost+'/download/'+this.session._id+'/ezBIDS.json');
                    this.analyzed = true;
                }
                break;

            case "finished":
            case "failed":
                break;
            }
        },
    },
})



