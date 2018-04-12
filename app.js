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
const imageUrl = 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png';
const imageUrl2 = 'https://lh3.googleusercontent.com/Nu3a6F80WfixUqf_ec_vgXy_c0-0r4VLJRXjVFF_X_CIilEu8B9fT35qyTEj_PEsKw';
const linkUrl = 'https://assistant.google.com/';

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


var mqtt = require('mqtt');
var client = mqtt.connect('mqtt://ec2.mcommerce.com.vn', {
    port: 1883
    // port: 11235,
    // username: 'cosllpth',
    // password: 'mDz0FLgPrYJB'
});

client.on('connect', function () {
    client.subscribe('house/sensor/humidity');
    client.subscribe('house/sensor/temperature');

    //    client.publish('presence', 'Hello mqtt')

    mqttReady = true;
})

client.on('message', function (topic, message) {
    // message is Buffer
    console.log(topic + " ->" + message.toString())

    switch (topic) {
        case 'house/sensor/temperature':
            temperature = parseFloat(message);
            break;

        case 'house/sensor/humidity':
            humidity = parseFloat(message);
            break;

        default:
            break;
    }
    // client.end()
})


const deltaChange = 0.3;
const INTERVAL_PUSH = 5 * 60 * 1000;

var currentIntervalPush = 0;
const homeControlChecker = setInterval(() => {

    let changed = false;
    if (Math.abs(latestTemp - temperature) > deltaChange) {
        latestTemp = temperature;
        changed = true;
    }

    if (Math.abs(latestHumidity - humidity) > deltaChange) {
        latestHumidity = humidity;
        changed = true;
    }

    if (changed == true || currentIntervalPush + INTERVAL_PUSH > moment()) {
        if (currentIntervalPush + INTERVAL_PUSH > moment()) {
            currentIntervalPush = moment();
        }
        mServer.saveDTH(latestTemp, latestHumidity, (msg) => { console.log(msg); });
    }
}, 1 * 60 * 1000);

setInterval(function () {
    https.get("https://home-control-2018.herokuapp.com");
}, 300000); // every 5 minutes (300000)


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: conf.FIREBASE_URL
});

admin.database().ref('/').on('value', function (postSnapshot) {
    mDs.parseFromFirebase(postSnapshot);
});

let app = express();
app.set('port', (process.env.PORT || 8080));
app.use(bodyParse.json({ type: 'application/json' }));

var server = app.listen(app.get('port'), function () {
    console.log('App host %s', server.address().address);
    console.log('App listening on port %s', server.address().port);
    console.log('Press Ctrl+C to quit.');
});

app.post('/config', function (request, response) {
    // let conf = JSON.parse(request.body);
    console.log("-------> config");
    console.log(request.body.name);
    response.end("done");
});

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
        agent.add('Marika cafe xin kính chào quý khách!');
        mDs.buildHome(agent);
    }

    function fallback(agent) {
        agent.add('Yêu cầu không thể xử lí');
        agent.add('Xin thử lại với yêu cầu khác');
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
        client.publish(device.topic, action.value, { qos: 2 }, (err, pack) => {
        });
        agent.add('Đã ' + convAction(action.type) + ' ' + device.name);
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

    if (agent.requestSource === agent.ACTIONS_ON_GOOGLE) {
        intentMap.set(null, googleAssistantOther);
    } else {
        intentMap.set(null, other);
    }
    agent.handleRequest(intentMap);
});