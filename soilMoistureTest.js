const fetch = require('node-fetch');

const lat = 58.7999;
const lng = 17.8081;
const params = 'soilMoisture';

//soilMoisture API was down during the competition :(
//here's Stormglass API's example code, which failed to result data

fetch(`https://api.stormglass.io/v2/bio/point?lat=${lat}&lng=${lng}&params=${params}`, {
    headers: {
        'Authorization': process.env.WEATHER_API_KEY
    }
}).then((response) => response.json()).then((jsonData) => {
    console.log(jsonData);
});