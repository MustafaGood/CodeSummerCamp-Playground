import oExpress from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import bodyParser from 'body-parser';
import { spawn } from 'node:child_process';
import session from 'cookie-session';
import {randomUUID} from 'crypto';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(dirname(__filename));
const app = oExpress();
const port = 3000;


//include folders in running server
app.use('/css', oExpress.static(path.join(__dirname, 'css')));
app.use(oExpress.static(path.join(__dirname, 'pages')));
app.use('/codefiles', oExpress.static(path.join(__dirname, 'codefiles')));
app.use('/images', oExpress.static(path.join(__dirname, 'images')));
app.use('/video', oExpress.static(path.join(__dirname, 'video')));
app.use('/node_modules', oExpress.static(path.join(__dirname, 'node_modules')));
app.use('/outputfiles', oExpress.static(path.join(__dirname, 'outputfiles')));
app.use(bodyParser.text({ type: 'text/plain'}))
app.use(bodyParser.json({ type: 'application/json'}))

// Use TEMPORARY COOKIES for sessions
app.use(session({
    name: 'CSCsession', 
    keys: ['secret-key', 'old-key'], // OR use secret, for only one option
    httpOnly: true, 
    secure: false,  //true for HTTPS
    maxAge: 1000 * 60 * 60 * 12 //expires after 12 hours or on browser close
}))

// Generate a unique session ID if one doesn't exist
app.use((req, res, next) => {
    if (!req.session.id) {
      req.session.id = randomUUID();
    }
    next();
  });

// Use PERSISTING COOKIES for recognizing sessions
// FROM https://expressjs.com/en/resources/middleware/session.html
// app.use(session({
//     secret: 'secret-key', // Set in container env variables. should be an array where top is current secrets and older ones further down (to not close active sessions on change)
//     name: 'CSCsessionID', // ID-name, same for all
//     resave: false, //check with storage if it implements the touch method. If it does, set resave: false. If it does not and your store sets an expiration date on stored sessions, you likely need resave: true
//     saveUninitialized: true, //should be false, gdpr need permissions for cookies on client-side
//     cookie: { 
//         secure: false, // secure: true means cookies are only sent over https.
//         maxAge: 1000 * 60 * 60 * 12 // Expires after 12 hours
//     },
//     //store: // default MemoryStore leaky and unsafe
// }));

// Future function when login implemented
// app.get('/logout', (req, res) => {
//     req.session.destroy((err) => { // Destroys cookie/session on logout
//         if (err) {
//             console.log(err);
//         }
//         res.redirect('/login');
//     });
// });

// // OR Use HEADER to identify the session for all calls
// app.use((req, res, next) => {
//     const sessionId = req.headers['X-session-ID'];
//     next();
// });

// app.mkactivity("/", (req, res) => {
//     writeToFile(req.body)
//     res.send(`handled request: (${res.statusCode})`)
//     console.log(req.body)
//     runPython()
// })

app.get('/playground/:lang', (req, res) => {
    let lang = req.params.lang
    res.sendFile(path.join(__dirname, 'pages', `playground_${lang}.html`));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'login.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'contact.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'about.html'));
});

/* Returns assignment data to load into website */
app.get('/assignmentData/:assignmentID', (req, res) => {
    let assignment = getAssignment(req.params.assignmentID)
    res.setHeader('Content-Type', 'application/json')
    res.send(JSON.stringify(assignment))
})

/* Adds user code to assignment data and sends to shared files for testing in container */
app.post("/run/:lang/:assignmentID", (req, res) => {
    // Start watcher to listen for changes in file named after sessionID
    let watcher = createListener(req, res)
    watcher.addListener('close', () => {
        console.log("...closed watcher..")
    })
    let lang = req.params.lang
    let assignment = getAssignment(req.params.assignmentID)
    // Combine assignmentData with user code, if not stop watcher and send errorcode
    if (! addUserCodeToAssignment(assignment, lang, req, res)) {
        watcher.close()
        res.send()
    }
})

function getAssignment(assignmentID) {
    let assignmentjson = {"exists": false}
    let data = fs.readFileSync(path.join(__dirname, 'files', 'assignmentData.json'), 'utf8')
    let jdata=JSON.parse(data)

    console.log("Parsing JSTRING")
    // Finds the assignment based on ID
    if (assignmentID in jdata) {
        assignmentjson = jdata[assignmentID]
        assignmentjson["exists"] = true       
    }  
    console.log("PARSED")
    return assignmentjson
}

// FROM https://nodejs.org/docs/latest/api/fs.html#fswatchfilename-options-listener
function createListener(req, res) {
    let filepath = path.join(__dirname, 'outputfiles', `${req.session.id}.json`)
    fs.appendFileSync(filepath, '', (err) => { 
        if (err) console.log(err)
    })
    let watcher = fs.watch(filepath, (eventType, filename) => {
        console.log(`Event type: ${eventType} Filename: ${filename}`)
            if (eventType == 'change') {                
                let testResult = JSON.parse(fs.readFileSync(filepath))["returned"]
                res.setHeader('Content-Type', 'application/json')
                res.send(JSON.stringify(testResult))
                console.log("---testresult from dind---", JSON.stringify(testResult))
                watcher.close()
            }
        });
    return watcher
};

function addUserCodeToAssignment(assignment, lang, req, res) {
    let body = req.body.split('\n')
    let codeComboWombo = []
    // installs NYI
    let inst = ['numpty', "dumpty"]
    // Add student code line by line into support code
    try {
        assignment.supportCode.forEach(line => {        
            if(line == "---CODE---")
                body.forEach(element => codeComboWombo.push(element))
            else 
                codeComboWombo.push(line)
        }); 
        // Writes file and saves to container
        let dataToContainer = {
            "sent": { 
                "id": req.session.id, 
                "language": lang,
                "installs": inst, 
                "code": codeComboWombo,
                "testCode": assignment.testCode
        }}
        fs.writeFile(`codefiles/${req.session.id}.json`, JSON.stringify(dataToContainer, null, 4), (err) => {
            if(err) console.log(err)
            else console.log("---Data written to file---", dataToContainer)
        })
    }   
    catch (error) {
        console.log(error.name, error.message)
        if (error.name == "TypeError") {
            console.log(`! Assignment ${req.params.assignmentID} is probably not properly formatted`)
            res.status(501)
            res.statusMessage = `Could not parse Assignment:${req.params.assignmentID}`
        }
        else {
            res.status(501)
            res.statusMessage = `Unknown error when parsing AssignmentData:${req.params.assignmentID}`
        }
        return false
    }
    return true
}

/* Old run-code function */
// app.post("/", (req, res) => {
//     console.log('Session data:', req.session);
//     console.log('req.sessionID: ', req.session.id)
//     console.log('req.params: ', req.params)

//     writeToFile(req)
//     res.send(`handled request: (${res.statusCode})`)
//     console.log(req.body)
// //    runPython()
// })

// function writeToFile(req) {
//     let lang = 1 //1 = python3.12 
//     let dataToContainerStarter = {
//         "sent": { 
//             "id": req.session.id, 
//             "language": lang,
//             "installs": ["numpy", "pandas", "jquery"], 
//             "code": req.body,
//             "data": "exempel-data testdata-länk osv"
//     }}
    
//     fs.writeFile(`codefiles/${req.session.id}.json`, JSON.stringify(dataToContainerStarter, null, 4), (err) =>
//     {
//         if(err) console.log(err)
//         else console.log("Data written to file.... ", dataToContainerStarter)
//     })
// }

app.get("./", (bRequire, bResponse) => {
    console.log(bRequire)
    bResponse.send("ertueruthdjkgdjkfg")
})


app.listen(port, () => {
    console.log("server running at http://localhost:%s", port)
}) 

/*
let connectToBackend =()=>
{
    //från https://dev.to/g33konaut/reading-local-files-with-javascript-25hn
    filePath = "./files/testText.txt";
    const reader = new FileReader();
    reader.onload = function fileReadCompleted() {
        // when the reader is done, the content is in reader.result.
        console.log(reader.result);
    };
    reader.readAsText(this.files[0]);
}

//From https://nodejs.org/api/child_process.html#child-process

let runPython =()=> {
    const ls = spawn('sh', ['server/python.sh']);
    ls.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    ls.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    ls.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });
}

function createContainer(){
    console.log("export log here")
    //Taget från https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
    const ls = spawn('ls', ['-lh', '/usr']);

    ls.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    ls.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    ls.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });
}
*/

