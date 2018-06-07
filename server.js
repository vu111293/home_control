let rxhttp = require('rx-http-request').RxHttpRequest;
let moment = require('moment');
let uuidv4 = require('uuid/v4');

const Promise = require('promise');
const { Card, Suggestion, Image, Text, Payload } = require('dialogflow-fulfillment');
const util = require('util');

const MARIKA_HOMEPAGE_URL = 'http://marika.cafe/';
const HOMECONTROL_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwVepWQTGpxwOWU7r1_u7pARVQmgHJgGG1f1fsdEH0SQPQF58g/exec?action=push_data';
const SLACK_SUPPORT = true;

class Server {
    constructor() {
        this.devices = [];
        // this.foods = [];
        // this.categories = [];
        // this.gifts = [];
        // this.promotions = [];
    }

    saveIotData(data) {
        var options = {
            headers: {
                'action': 'push_data',
                'Content-Type': 'application/json'
            },
            body: data,
            json: true
        }

        return new Promise(function (resolve, reject) {
            rxhttp.post(HOMECONTROL_SHEET_URL, options)
            .subscribe(
                (data) => {
                    let code = data.response.statusCode;
                    if (code == 200) {
                        resolve(JSON.stringify(data.response));
                    } else {
                        reject(code);
                    }
                },
                (err) => {
                    reject(err);
                }
            );
        });
    }

    saveDTH(temp, hum, callback) {
        let record = {
            id: uuidv4(),
            user_name: "vtester",
            device_name: "breakboard_p",
            temperature: temp,
            humidity: hum,
            created: moment().format("DD-MM-YYYY HH:mm:ss")
        }

        var options = {
            headers: {
                'action': 'home_control',
                'Content-Type': 'application/json'
            },

            body: record,
            json: true
        }

        rxhttp.post(HOMECONTROL_SHEET_URL, options)
            .subscribe(
                (data) => {
                    let code = data.response.statusCode;
                    if (code == 200) {
                        callback("sent!");
                    } else {
                        callback("error with code " + code);
                    }
                },
                (err) => {
                    callback(err);
                }
            );
    }
}

module.exports = Server;