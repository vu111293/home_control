'use strict';


const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Card, Suggestion, Image, Text, Payload } = require('dialogflow-fulfillment');
const { Carousel } = require('actions-on-google');
const conf = require('./configure');
const DataServer = require('./data-server.js');
const Server = require('./server.js');
const util = require('util');

let uuidv4 = require('uuid/v4');
let moment = require('moment');
let express = require('express');
let bodyParse = require('body-parser');
let admin = require("firebase-admin", conf.SERVER_KEY_PATH);
let serviceAccount = require(conf.SERVER_KEY_PATH);
let https = require("https");

// sensor
let temperature = 0;
let latestTemp = 0;
let humidity = 0;
let latestHumidity = 0;


// led control
let led01Status = 0;
let led02Status = 0;
let led03Status = 0;

let mqttReady = false;


process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

const SLACK_SUPPORT = true;

const LIST_DISPLAY = 'list-display-ui';
const IMAGE_DISPLAY = 'image-display-ui';
const CHART_DISPLAY = 'chart-display-ui';

const TOPPING_MAP = [
    {
        topping: ["sugar"],
        event: "askw-sugar-event"
    },
    {
        topping: ["sugar", "cream"],
        event: "askw-sugar-cream-event"
    },
    {
        topping: ["milk"],
        event: "askw-milk-event"
    }
];

let mDs = new DataServer();
let mServer = new Server();

const DATA_TOPIC = "IN_MQTT";
const EVENT_TOPIC = "AN";

var mqtt = require('mqtt');
var client = mqtt.connect('mqtt://ec2.mcommerce.com.vn', {
    port: 1883
    // port: 11235,
    // username: 'cosllpth',
    // password: 'mDz0FLgPrYJB'
});

client.on('connect', function () {
    client.subscribe(DATA_TOPIC);
    client.subscribe(EVENT_TOPIC);

    //    client.publish('presence', 'Hello mqtt')
    mqttReady = true;
    console.log('MQTT ready');
})

client.on('message', function (topic, message) {
    // message is Buffer
    console.log(topic + " ->" + message.toString())
    switch (topic) {
        case DATA_TOPIC:
            let data = parseIotData(message);
            if (data) {
                mServer.saveIotData(data)
                    .then(r => console.log(r))
                    .catch(err => console.log(err));
            }
            break;

        case EVENT_TOPIC:
            let event = parseIotEvent(message);
            if (event) {
                mServer.saveIotData(event)
                    .then(r => console.log(r))
                    .catch(err => console.log(err));
            }
            // humidity = parseFloat(message);
            break;

        default:
            break;
    }
    // client.end()
})

function parseIotData(raw) {
    let js = JSON.parse(raw);

    if (js && js.M) {
        return {
            mac_address: js.M,
            temp: js.T == undefined ? "" : js.T,
            humidity: js.H == undefined ? "" : js.H,
            input01: js.I[0] == undefined ? "" : js.I[0],
            input02: js.I[1] == undefined ? "" : js.I[1],
            input03: js.I[2] == undefined ? "" : js.I[2],
            input04: js.I[3] == undefined ? "" : js.I[3],
            output01: js.O[0] == undefined ? "" : js.O[0],
            output02: js.O[1] == undefined ? "" : js.O[1],
            p: js.P == undefined ? "" : js.P,
            c: js.C == undefined ? "" : js.C,
            alert: js.AN == undefined ? "" : js.AN,
            time: new Date().getTime()
        };
    } else {
        return null;
    }
}

function parseIotEvent(raw) {
    let js = JSON.parse(raw);
    if (js && js.M) {
        let rs = {
            mac_address: js.M,
            type: js.E,
            temp: "",
            humidity: "",
            input01: "",
            input02: "",
            input03: "",
            input04: "",
            output01: "",
            output02: "",
            p: "",
            c: "",
            alert: "",
            time: new Date().getTime()
        };

        switch (js.E) {
            case 0: // t/h
                rs.temp = js.T == undefined ? "" : js.T;
                rs.humidity = js.H == undefined ? "" : js.H;
                break;

            case 1: // input
                rs.input01 = js.I[0] == undefined ? "" : js.I[0];
                rs.input02 = js.I[1] == undefined ? "" : js.I[1];
                rs.input03 = js.I[2] == undefined ? "" : js.I[2];
                rs.input04 = js.I[3] == undefined ? "" : js.I[3];
                break;

            case 2: // output
                rs.output01 = js.O[0] == undefined ? "" : js.O[0];
                rs.output02 = js.O[1] == undefined ? "" : js.O[1];
                break;

            case 3: // alarm
                rs.alert = js.AN == undefined ? "" : js.AN;
                break;

            default:
                rs = null;
                break;
        }

        return rs;
    } else {
        return null;
    }
}
// let mDeltaChanged = 0.3;
// let mIntervalPush = 5 * 60 * 1000;
// let mIntervalCheck = 60 * 1000;
// var currentIntervalPush = moment();

// const monitorHandler = () => {
//     console.log('check ....');
//     let changed = false;
//     if (Math.abs(latestTemp - temperature) > mDeltaChanged) {
//         latestTemp = temperature;
//         changed = true;
//     }

//     if (Math.abs(latestHumidity - humidity) > mDeltaChanged) {
//         latestHumidity = humidity;
//         changed = true;
//     }

//     if (changed == true || currentIntervalPush + mIntervalPush < moment()) {
//         if (currentIntervalPush + mIntervalPush < moment()) {
//             currentIntervalPush = moment();
//         }
//         mServer.saveDTH(latestTemp, latestHumidity, (msg) => { console.log(msg); });
//     }
// };
// let mSensorIntervalId = setInterval(monitorHandler, mIntervalCheck);

// setInterval(function () {
//     https.get("https://home-control-2018.herokuapp.com");
// }, 300000); // every 5 minutes (300000)


// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//     databaseURL: conf.FIREBASE_URL
// });

// admin.database().ref('/').on('value', function (postSnapshot) {
//     mDs.parseFromFirebase(postSnapshot);
// });

let app = express();
app.set('port', (process.env.PORT || 8080));
app.use(bodyParse.json({ type: 'application/json' }));

var server = app.listen(app.get('port'), function () {
    console.log('App host %s', server.address().address);
    console.log('App listening on port %s', server.address().port);
    console.log('Press Ctrl+C to quit.');
});


app.post('/msconfig', function (request, response) {
    let topic = request.body.mac + "/config";
    client.publish(topic, JSON.stringify(request.body), {qos: 1, retain: true}, (e, p) => {
        if (e) {
            response.status(500).send('Can not push config');
        } else {
            response.status(200).send("Ok");
        }
    });
});


// app.get('/config', function (request, response) {
//     response.status(200).send({
//         'checkInterval': mIntervalCheck,
//         'pushInterval': mIntervalPush,
//         'deltaChanged': mDeltaChanged
//     });
// });

// app.post('/stopUpdate', function (request, response) {
//     console.log('request stop updated');
//     try {
//         clearInterval(mSensorIntervalId);
//         response.status(200);
//         response.send('Ok');
//     } catch (error) {
//         response.status(300);
//         response.send('Error: ' + error.message);
//     }
// });

// app.post('/config', function (request, response) {
//     console.log("check interval: " + request.body.checkInterval);
//     console.log("push interval: " + request.body.pushInterval);
//     console.log("delta changed: " + request.body.deltaChanged);

//     try {
//         let check = parseInt(request.body.checkInterval);
//         let push = parseInt(request.body.pushInterval);
//         let delta = parseFloat(request.body.deltaChanged);

//         mIntervalCheck = check;
//         mIntervalPush = push;
//         mDeltaChanged = delta;

//         clearInterval(mSensorIntervalId);
//         currentIntervalPush = moment(); // reset
//         mSensorIntervalId = setInterval(monitorHandler, mIntervalCheck);

//         response.status(200);
//         response.send('Done');
//     } catch (err) {
//         response.status(300);
//         response.send('Invalid configure value. Check check again');
//     }
// });

app.post('/', function (request, response) {
    // console.log('header: ' + JSON.stringify(request.headers));
    // console.log('body: ' + JSON.stringify(response.body));

    const agent = new WebhookClient({ request, response });
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    function googleAssistantOther(agent) {
        // Get Actions on Google library conv instance
        let conv = agent.conv();
        // Use Actions on Google library to add responses
        conv.ask('Please choose an item:')
        conv.ask(new Carousel({
            title: 'Google Assistant',
            items: {
                'WorksWithGoogleAssistantItemKey': {
                    title: 'Works With the Google Assistant',
                    description: 'If you see this logo, you know it will work with the Google Assistant.',
                    image: {
                        url: imageUrl,
                        accessibilityText: 'Works With the Google Assistant logo',
                    },
                },
                'GoogleHomeItemKey': {
                    title: 'Google Home',
                    description: 'Google Home is a powerful speaker and voice Assistant.',
                    image: {
                        url: imageUrl2,
                        accessibilityText: 'Google Home',
                    },
                },
            },
        }))
        // Add Actions on Google library responses to your agent's response
        agent.add(conv);
    }

    function welcome(agent) {
        agent.add('em hôm kính chào quý khách!');
        // mDs.buildHome(agent);
    }

    function fallback(agent) {
        agent.add('Yêu cầu không thể xử lí');
        // agent.add('Xin thử lại với yêu cầu khác');
    }

    function other(agent) {
        agent.add(`This message is from Dialogflow's Cloud Functions for Firebase editor!`);
        agent.add(new Card({
            title: `Title: this is a card title`,
            imageUrl: imageUrl,
            text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
            buttonText: 'This is a button',
            buttonUrl: linkUrl
        })
        );
        agent.add(new Suggestion(`Quick Reply`));
        agent.add(new Suggestion(`Suggestion`));
        agent.add(new Text('Yeah this is text'));
        agent.add(new Image(imageUrl2));
        agent.setContext({ name: 'weather', lifespan: 2, parameters: { city: 'Rome' } });
    }


    // HOME CONTROL methods
    function deviceTurnOffRequest(agent) {
        deviceTurnAction(agent, {
            type: 'off',
            value: '0'
        });
    }

    function deviceTurnOnRequest(agent) {
        deviceTurnAction(agent, {
            type: 'on',
            value: '1'
        });
    }

    function deviceTurnAction(agent, action) {
        let device = agent.parameters['device'];
        if (device) {
            let mDevice = mDs.findDevice(device);
            if (mDevice) {
                turnDevice(agent, mDevice, action);
            } else {
                agent.add('Không tìm thấy thiết bị ' + device + '. Vui lòng thử với thiết bị khác');
            }
        } else {
            agent.add('Thiết bị ' + device + ' không hợp lệ. Xin thử lại');
        }
    }

    function turnDevice(agent, device, action) {
        const googlePayloadJson = {
            expectUserResponse: true,
            isSsml: false,
            noInputPrompts: [],
            richResponse: {
                items: [{ simpleResponse: { textToSpeech: 'hello', displayText: 'hi' } }]
            },
            systemIntent: {
                intent: 'actions.intent.OPTION',
            }
        }

        agent.add(JSON.stringify(googlePayloadJson));
    }

    function convAction(action) {
        let out = '';
        switch (action) {
            case 'off': out = 'tắt';
                break;

            case 'on': out = 'mở';
                break;

            default:
                break;
        }
        return out;
    }

    // Run the proper handler based on the matched Dialogflow intent
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    // intentMap.set('ask-product-order', askProducForOrder);
    intentMap.set('device-turnoff-request', deviceTurnOffRequest);
    intentMap.set('device-turnon-request', deviceTurnOnRequest);

    // help handler
    // intentMap.set('help-request', helpRequest);

    // if (agent.requestSource === agent.ACTIONS_ON_GOOGLE) {
    //     intentMap.set(null, googleAssistantOther);
    // } else {
    //     intentMap.set(null, other);
    // }
    agent.handleRequest(intentMap);
});