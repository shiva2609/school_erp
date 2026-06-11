const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1/',
});

console.log("Resolving 'users/':", api.getUri({ url: 'users/' }));
console.log("Resolving '/vendors/':", api.getUri({ url: '/vendors/' }));
