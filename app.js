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


const deltaChange = 0.5;
const INTERVAL_PUSH = 15 * 60 * 1000;

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


    // Support methods
    function createBill(agent, username) {
        let items;
        let cart = agent.getContext('shoppingcart');
        if (cart && cart.parameters.items && cart.parameters.items.length > 0) {
            items = cart.parameters.items;
        } else {
            agent.add('Giỏ hàng rỗng. Vui lòng chọn món');
            return;
        }

        let totalPrice = 0;
        var options = [];
        for (let i in items) {
            totalPrice += parseInt(items[i].price);
        }

        // create new bill in firebase database
        let uid = uuidv4();
        admin.database().ref('/buillstack/' + uid).set({
            id: uid,
            username: username,
            orderlist: items,
            created: moment.now()
        });

        let condition = "'marika-coffee' in topics";
        // let topic = 'marika-coffee'
        let message = {
            notification: {
                title: 'Hóa đơn mới',
                body: 'Tổng hóa đơn ' + totalPrice + ' đồng.',
            },
            data: {
                type: 'take-away',
                orderId: uid,
                // ,
                // body: JSON.stringify(options)
            },
            condition: condition
            // topic: topic
        }
        admin.messaging().send(message)
            .then((response) => {
                console.log('Successfully sent message:', response);
            })
            .catch((error) => {
                console.log('Error sending message:', error);
            });

        agent.add('Yêu cầu của bạn đã được gửi đến Marika Cafe');
        agent.add('Cảm ơn *' + username + '* đã sử dụng dịch vụ.')
        agent.add('Xin vui lòng đợi phục vụ');
    }

    function addMultiToCart(agent, products) {
        let speakout = [];
        let cartcontext = agent.getContext('shoppingcart');
        if (!cartcontext) {
            cartcontext = {
                name: 'shoppingcart',
                lifespan: 50,
                parameters: {
                    items: []
                }
            }
        }
        let items = cartcontext.parameters.items;
        if (!items) { items = []; }

        for (let i in products) {
            let item = products[i];
            items.push({
                'name': item.product.name,
                'price': item.product.price,
                'quantity': parseInt(item.quantity),
                'options': item.options
            });
            speakout.push(util.format('x %s *%s* - %s', item.quantity, item.product.name, convTopping(item.options)));
        }

        cartcontext.parameters = { 'items': items };
        agent.setContext(cartcontext);
        agent.add('Đã thêm:');
        for (let i in speakout) {
            agent.add(new Text(util.format('• %s', speakout[i])));
            // agent.add(new Suggestion(speakout[i]));
        }
        agent.add('Bạn có muốn chọn món kế tiếp?');
        buildNextAction(agent, ["THANH TOÁN", "ĐIỀU CHỈNH", "HỦY ĐƠN HÀNG"]);
        // agent.add('Gõ \"xem giỏ hàng\" để xem sản phẩm đã chọn');
        // agent.add('Gõ \"thanh toán\" để gửi yêu cầu thanh toán');
    }

    function findGroupEvent(options) {
        let found;
        let event = 'askw-nonetopping-event';

        if (!options) {
            return event;
        }
        for (let i in TOPPING_MAP) {
            found = true;
            for (let j in TOPPING_MAP[i].topping) {
                if (!options.includes(TOPPING_MAP[i].topping[j])) {
                    found = false;
                    break;
                }
            }
            if (found) {
                event = TOPPING_MAP[i].event;
                break;
            }
        }
        return event;
    }

    function viewCartOnly(agent) {
        let cartcontext = agent.getContext('shoppingcart');
        let ret = false;
        let total = 0;
        if (cartcontext != null && cartcontext.parameters.items != null) {
            agent.add('Giỏ hàng hiện tại của bạn là:');
            for (let i in cartcontext.parameters.items) {
                let item = cartcontext.parameters.items[i];
                agent.add(new Text(util.format('• %s x *%s*', item.quantity, item.name)));
                total += parseInt(item.price * item.quantity);
            }
            ret = true;
        }
        agent.add('Tổng tộng *' + mDs.formatPrice(total) + '* đồng');
        return ret;
    }

    function removeFromCart(agent, product) {
        let mProduct = mDs.findDevice(product);
        let found = false;
        if (mProduct) {
            let cartcontext = agent.getContext('shoppingcart');
            if (cartcontext != null && cartcontext.parameters.items != null) {
                let newItems = [];
                for (let i in cartcontext.parameters.items) {
                    let item = cartcontext.parameters.items[i];
                    if (mProduct.name.includes(item.name)) {
                        found = true;
                    } else {
                        newItems.push(item);
                    }
                }
                cartcontext.parameters.items = newItems;
            }
            agent.setContext(cartcontext);
        }
        return found;
    }

    function addToCart(agent, product, quantity, options) {
        let cartcontext = agent.getContext('shoppingcart');
        if (!cartcontext) {
            cartcontext = {
                name: 'shoppingcart',
                lifespan: 50,
                parameters: {
                    items: []
                }
            }
        }

        let items = cartcontext.parameters.items;
        if (!items) { items = []; }
        quantity = parseInt(quantity);
        items.push({
            'name': product.name,
            'price': product.price,
            'quantity': quantity,
            'options': options
        });
        cartcontext.parameters = { 'items': items };
        agent.setContext(cartcontext);
        agent.add('Đã thêm:');
        agent.add(new Text(util.format('• x%s *%s* - %s', quantity, product.name, convTopping(options))));
        // agent.add(new Suggestion(util.format('x %s *%s* - %s', quantity, product.name, convTopping(options))));
        agent.add('Bạn có muốn tiếp tục mua hàng?');
        buildNextAction(agent, ["THANH TOÁN", "ĐIỀU CHỈNH", "HỦY ĐƠN HÀNG"]);
        // agent.add('Gõ \"xem giỏ hàng\" để xem sản phẩm đã chọn');
        // agent.add('Gõ \"thanh toán\" để gửi yêu cầu thanh toán');
    }

    function buildNextAction(agent, actions) {
        for (let i in actions) {
            agent.add(new Suggestion(actions[i]));
        }
    }

    function convTopping(topping) {
        let out = [];
        if (topping) {
            let added = false;
            for (let k in topping) {
                let item = '';
                if (topping[k] == 'low') item = 'ít';
                else if (topping[k] == 'high') item = 'nhiều';
                else if (topping[k] == 'none') item = 'không';
                else continue;

                if (k == 'sugar') item += ' đường';
                else if (k == 'milk') item += ' sữa';
                else item += 'thing';
                out.push(item);
                added = true;
            }
            if (!added) {
                out.push('bình thường');
            }
        } else {
            out.push('bình thường');
        }

        return out.join(', ');
    }

    function handleSingleItemWithTopping(product, quantity, topping) {
        let parameters = {
            'product': product.name,
        };
        if (quantity > 0) {
            parameters.quantity = quantity;
        }
        // for (let i in topping) {
        //     let sp = topping[i].split('-');
        //     if (sp.length == 2) {
        //         parameters[sp[0]] = sp[1];
        //     }
        // }

        if (topping) {
            for (let k in topping) {
                parameters[k] = topping[k];
            }
        }

        let event = findGroupEvent(product.options);
        if (event) {
            agent.setFollowupEvent({
                name: event,
                parameters: parameters
            });
        } else {
            agent.add('Hiện tại không bán ' + product);
        }
    }


    function viewCart(agent) {
        let cart = agent.getContext('shoppingcart');
        if (!cart || !cart.parameters.items || cart.parameters.items.length == 0) {
            agent.add('Giỏ hàng rỗng. Xin mời bạn chọn món');
            mDs.buildRichCategories(agent);
            return;
        }

        agent.add('Hiện tại bạn có:')
        let total = 0;
        for (let i in cart.parameters.items) {
            let item = cart.parameters.items[i];
            // agent.add(new Suggestion(util.format('x%s *%s* - %s', parseInt(item.quantity), item.name, convTopping(item.options))));
            agent.add(new Text(util.format('• x%s *%s* - %s', parseInt(item.quantity), item.name, convTopping(item.options))));
            total += parseInt(item.price * item.quantity);
        }

        agent.add('Tổng tộng *' + mDs.formatPrice(total) + '* đồng');
        agent.add('Bạn có muốn tiếp tục mua hàng?');
        buildNextAction(agent, ["THANH TOÁN", "ĐIỀU CHỈNH", "HỦY ĐƠN HÀNG"]);
    }


    function turnDevice(device, action) {

    }

    // HOME CONTROL methods
    function deviceTurnOffReqeust(agent) {
        let device = agent.parameters['device'];
        if (device) {
            let mDevice = mDs.findDevice(device);
            if (mDevice) {
                mDevice
            } else {
                agent.add('Không tìm thấy thiết bị ' + device + '. Vui lòng thử với thiết bị khác');
            }
        } else {
            agent.add('Thiết bị ' + device + ' không hợp lệ. Xin thử lại');
        }
    }

    // Run the proper handler based on the matched Dialogflow intent
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('ask-product-order', askProducForOrder);
    intentMap.set('device-turnoff-request', deviceTurnOffReqeust);

    // help handler
    intentMap.set('help-request', helpRequest);

    if (agent.requestSource === agent.ACTIONS_ON_GOOGLE) {
        intentMap.set(null, googleAssistantOther);
    } else {
        intentMap.set(null, other);
    }
    agent.handleRequest(intentMap);
});