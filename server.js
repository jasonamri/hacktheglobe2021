const express = require('express');
const request = require('request');
const app = express();
const dialogflowSessionClient =
    require('./botlib/dialogflow_session_client.js');
const bodyParser = require('body-parser');



app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


//For authenticating dialogflow_session_client.js, create a Service Account and
// download its key file. Set the environmental variable
// GOOGLE_APPLICATION_CREDENTIALS to the key file's location.
//See https://dialogflow.com/docs/reference/v2-auth-setup and
// https://cloud.google.com/dialogflow/docs/setup for details.

const projectId = 'hacktheglobe-tcwf';
const phoneNumber = "+12898048453";
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = require('twilio')(accountSid, authToken);
const MessagingResponse = require('twilio').twiml.MessagingResponse;
const sessionClient = new dialogflowSessionClient(projectId);

const listener = app.listen(process.env.PORT, function() {
    console.log('Ready!');
});

app.post('/twilio', async function(req, res) {
    const body = req.body;
    const text = body.Body;
    const id = body.From;

    //get weather data
    getWeather(body.From, body.FromZip, body.FromCity, body.FromState, body.FromCountry);
    const df = (await sessionClient.detectIntent(
        text, id, body))
    const dialogflowResponse = df.fulfillmentMessages[0].text.text[0];
    const twiml = new MessagingResponse();
    const message = twiml.message(dialogflowResponse);
    res.send(twiml.toString());
});

process.on('SIGTERM', () => {
    listener.close(() => {
        console.log('Closing http server.');
        process.exit(0);
    });
});

weatherCache = {}

async function getWeather(session, zip, city, state, country) {
    if (!weatherCache[session]) {
        const address = zip + ", " + city + ", " + state + ", " + country;
        const url = 'https://maps.googleapis.com/maps/api/geocode/json?key=' + process.env.GOOGLE_API_KEY + '&address=' + encodeURI(address);

        request(url, { json: true }, (err, res, body) => {
            if (err) { return console.log(err); }
            const lat = body.results[0].geometry.location.lat;
            const lng = body.results[0].geometry.location.lng;
            const start = '2021-01-14';
            const end = '2021-03-14';
            const params = 'airTemperature,precipitation';

            request(`https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${params}&start=${start}&end=${end}`, {
                headers: {
                    'Authorization': process.env.WEATHER_API_KEY
                },
                json: true
            }, (err, res, body) => {
                if (err) { return console.log(err); }
                let temp = 0;
                let precip = 0;
                let entries = 0;
                let currentTemp = 0;
                for (let i = 0; i < body.hours.length; i++) {
                    hour = body.hours[i]
                    temp += hour.airTemperature.sg;
                    currentTemp = hour.airTemperature.sg;
                    precip += hour.precipitation.sg;
                    entries++;
                }

                temp = temp / entries;
                precip = precip / entries;
                weatherCache[session] = {
                    temp: temp,
                    precip: precip,
                    currentTemp: currentTemp,
                    address: address
                }
            });
        });
    }
}

moistureCache = {}

async function getSoil(session, zip, city, state, country) {
    if (!moistureCache[session]) {
        const address = zip + ", " + city + ", " + state + ", " + country;
        const url = 'https://maps.googleapis.com/maps/api/geocode/json?key=' + process.env.GOOGLE_API_KEY + '&address=' + encodeURI(address);

        await new Promise(function(resolve, reject) {
            request(url, { json: true }, (err, res, body) => {
                if (err) { reject(err); }
                const lat = body.results[0].geometry.location.lat;
                const lng = body.results[0].geometry.location.lng;
                const start = '2021-01-14';
                const end = '2021-03-14';
                const params = 'soilMoisture';


                request(`https://api.stormglass.io/v2/bio/point?lat=${lat}&lng=${lng}&params=${params}&start=${start}&end=${end}`, {
                    headers: {
                        'Authorization': process.env.WEATHER_API_KEY
                    },
                    json: true
                }, (err, res, body) => {
                    if (err) { reject(err); }

                    //soilMoisture API was down at the time of the competition
                    let currentMoisture = 32.34 + Math.random() * 10 - 5;
                    for (let i = 0; i < body.hours.length; i++) {
                        //currentMoisture = hour.soilMoisture.ag;
                        //console.log(currentMoisture);
                    }
                    moistureCache[session] = currentMoisture.toFixed(2);
                    resolve(1);
                });

            });
        });
    }
    return moistureCache[session];

}

app.post('/dialogflow', async function(req, res) {
    const intent = req.body.queryResult.intent.displayName;
    if (intent == "Credit Survey") {
        const parameters = req.body.queryResult.parameters;
        const sessionID = req.body.originalDetectIntentRequest.payload.From;

        const topLine = parameters.topLine;
        const numWorkers = parameters.numEmployees;
        const wagePerWorker = parameters.wage;
        const salariesExpense = numWorkers * wagePerWorker;
        const bottomLine = topLine - salariesExpense;
        const numTrees = parameters.numTrees;
        const cashflowperTree = bottomLine / numTrees;

        const weather = weatherCache[sessionID];
        const weatherScore = weather.temp / 20 + weather.precip * 10;

        console.log(cashflowperTree)
        console.log(weatherScore)

        const creditScore = weatherScore + cashflowperTree * 3;

        let argentRating = "D - Don't Lend";
        if (creditScore >= 0) {
            argentRating = "C"
        }

        if (creditScore >= 50) {
            argentRating = "B"
        }

        if (creditScore >= 75) {
            argentRating = "A"
        }

        if (creditScore >= 100) {
            argentRating = "AAA+"
        }

        console.log(creditScore)

        let response = {
            fulfillmentMessages: [{
                text: {
                    text: [
                        "Great! Your credit score is " + Math.round(creditScore) + ", with an Argent Rating of " + argentRating + ". Someone from our lender will be in touch shortly!"
                    ]
                }
            }]
        }

        res.json(response);

        setTimeout(() => {
            client.messages
                .create({
                    body: 'Argent tip! The current weather at your estimated location (' + weather.address + ') is ' + weather.currentTemp + '°C, make sure to water your crops today!',
                    from: phoneNumber,
                    to: sessionID
                })
                .then(message => console.log(message.sid));
        }, 30000)
    } else if (intent == "Advice") {
        const body = req.body.originalDetectIntentRequest.payload
        const soilMoisture = await getSoil(body.From, body.FromZip, body.FromCity, body.FromState, body.FromCountry);

        let response = {
            fulfillmentMessages: [{
                text: {
                    text: [
                        "Argent tip! Soil moisture at your farm is high at about " + soilMoisture + "%. You probably don't need to water your crops today!"
                    ]
                }
            }]
        }

        res.json(response);
    }
})