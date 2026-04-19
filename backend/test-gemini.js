const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI('AIzaSyDsESG8X0Karg9e6M6lBsDlyLKVXOBhcuY');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
model.generateContent('Hi').then(res => console.log(res.response.text())).catch(err => console.error(err.message));
