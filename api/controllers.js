"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mkdirp = require("mkdirp");
const archiver = require("archiver");
const config = require("./config");
const models = require("./models");
const upload = multer(config.multer);
const router = express.Router();
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '/uploads'));
    },
    filename: function (req, file, cb) {
        let fileExtension = file.originalname.split('.')[1];
        cb(null, file.fieldname + '-' + Date.now() + '.' + fileExtension);
    }
});
router.post('/session', (req, res, next) => {
    req.body.status = "created";
    let session = new models.Session(req.body);
    session.save().then(_session => {
        res.json(_session);
    }).catch(err => {
        next(err);
    });
});
router.get('/session/:session_id', (req, res, next) => {
    models.Session.findById(req.params.session_id).then(session => {
        res.json(session);
    }).catch(err => {
        next(err);
    });
});
/*
//deprecated by /download/:session_id/*
router.get('/session/:session_id/log', (req, res, next) => {
    models.Session.findById(req.params.session_id).then(session=>{
        res.setHeader("content-type", "text/plain");
        fs.createReadStream(config.workdir+"/"+session._id+"/preprocess.log").pipe(res);
    }).catch(err=>{
        next(err);
    });
});

//deprecated by /download/:session_id/*
router.get('/session/:session_id/error', (req, res, next) => {
    models.Session.findById(req.params.session_id).then(session=>{
        res.setHeader("content-type", "text/plain");
        fs.createReadStream(config.workdir+"/"+session._id+"/preprocess.err").pipe(res);
    }).catch(err=>{
        next(err);
    });
});

//deprecated by /download/:session_id/*
router.get('/session/:session_id/list', (req, res, next) => {
    models.Session.findById(req.params.session_id).then(session=>{
        res.setHeader("content-type", "text/plain");
        fs.createReadStream(config.workdir+"/"+session._id+"/list").pipe(res);
    }).catch(err=>{
        next(err);
    });
});

//deprecated by /download/:session_id/*
router.get('/session/:session_id/ezbids', (req, res, next) => {
    models.Session.findById(req.params.session_id).then(session=>{
        res.setHeader("content-type", "application/json");
        console.debug("loading ezbids.json from", config.workdir, session._id);
        fs.createReadStream(config.workdir+"/"+session._id+"/ezBIDS.json").pipe(res);
    }).catch(err=>{
        next(err);
    });
});
*/
router.patch('/session/:session_id/finalize', (req, res, next) => {
    models.Session.findById(req.params.session_id).then(session => {
        if (!session)
            return next("no such session");
        req.pipe(fs.createWriteStream(config.workdir + "/" + session._id + "/finalized.json"));
        req.on('end', () => {
            session.status = "finalized";
            session.save().then(() => {
                res.send("ok");
            });
        });
    }).catch(err => {
        console.error(err);
        next(err);
    });
});
//let user download files within session (like the .png image generated by analyzer)
router.get('/download/:session_id/*', (req, res, next) => {
    models.Session.findById(req.params.session_id).then(session => {
        let basepath = config.workdir + "/" + session._id;
        //validate path so it will be inside the basepath
        let fullpath = path.resolve(basepath + "/" + req.params[0]);
        if (!fullpath.startsWith(basepath))
            return next("invalid path");
        //res.setHeader("content-type", "application/json"); //TODO - set to correct mime?
        //TODO - if requested path is a file, thenstream
        let stats = fs.lstatSync(fullpath);
        if (stats.isFile())
            fs.createReadStream(fullpath).pipe(res);
        else if (stats.isDirectory()) {
            const archive = archiver('zip', {
                zlib: { level: 9 }
            });
            archive.directory(fullpath, 'bids');
            archive.finalize();
            archive.pipe(res);
        }
        else
            next("unknown file");
        //TODO - if it's directory, then send an archive down
    }).catch(err => {
        next(err);
    });
});
router.post('/upload/:session_id', upload.single('file'), (req, res, next) => {
    models.Session.findById(req.params.session_id).then(session => {
        let src_path = req.file.path;
        let dirty_path = config.workdir + "/" + req.params.session_id + "/" + req.body.path;
        let dest_path = path.resolve(dirty_path);
        if (!dest_path.startsWith(config.workdir))
            return next("invalid path");
        let destdir = path.dirname(dest_path);
        //move the file over to workdir
        mkdirp(destdir).then(err => {
            fs.rename(src_path, dest_path, err => {
                if (err)
                    return next(err);
                res.send("ok");
            });
        });
    }).catch(err => {
        console.error(err);
        next(err);
    });
});
//done uploading.
router.patch('/session/uploaded/:session_id', (req, res, next) => {
    models.Session.findByIdAndUpdate(req.params.session_id, { status: "uploaded", upload_finish_date: new Date() }).then(session => {
        if (!session)
            return next("no such session");
        res.send("ok");
    }).catch(err => {
        console.error(err);
        next(err);
    });
});
module.exports = router;
//# sourceMappingURL=controllers.js.map