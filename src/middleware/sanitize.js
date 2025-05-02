const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

const sanitizeData = [
  // Remove $ and . from request body to prevent NoSQL injection
  mongoSanitize(),
  
  // Clean user input from malicious HTML/JavaScript XSS attacks
  xss(),
  
  // Custom sanitization middleware
  (req, res, next) => {
    if (req.body) {
      // Recursively sanitize objects
      const sanitizeObject = (obj) => {
        Object.keys(obj).forEach(key => {
          if (typeof obj[key] === 'string') {
            // Remove HTML tags except allowed ones
            obj[key] = obj[key].replace(/<(?!\/?(b|i|em|strong)(?=>|\s.*>))\/?.*?>/g, '');
            // Trim whitespace
            obj[key] = obj[key].trim();
          } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitizeObject(obj[key]);
          }
        });
      };
      
      sanitizeObject(req.body);
    }
    next();
  }
];

module.exports = sanitizeData;