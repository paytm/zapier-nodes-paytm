// @ts-nocheck
'use strict';
var crypto = require('crypto');

class PaytmChecksum {
  static encrypt(input, key) {
    var cipher = crypto.createCipheriv('AES-128-CBC', key,
      PaytmChecksum.iv);
    var encrypted = cipher.update(input, 'binary', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }
  static generateSignature(params, key) {
    if (typeof params !== 'object' && typeof params !== 'string') {
      return Promise.reject('string or object expected');
    }
    if (typeof params !== 'string') {
      params = PaytmChecksum.getStringByParams(params);
    }
    return PaytmChecksum.generateSignatureByString(params, key);
  }
  static async generateSignatureByString(params, key) {
    var salt = await PaytmChecksum.generateRandomString(4);
    return PaytmChecksum.calculateChecksum(params, key, salt);
  }
  static generateRandomString(length) {
    return new Promise(function (resolve, reject) {
      crypto.randomBytes((length * 3.0) / 4.0, function (err, buf) {
        if (!err) { resolve(buf.toString('base64')); }
        else { reject(err); }
      });
    });
  }
  static getStringByParams(params) {
    var data = {};
    Object.keys(params).sort().forEach(function (key) {
      data[key] = params[key] !== null &&
        params[key].toLowerCase() !== null ? params[key] : '';
    });
    return Object.values(data).join('|');
  }
  static calculateHash(params, salt) {
    var finalString = params + '|' + salt;
    return crypto.createHash('sha256')
      .update(finalString).digest('hex') + salt;
  }
  static calculateChecksum(params, key, salt) {
    var hashString = PaytmChecksum.calculateHash(params, salt);
    return PaytmChecksum.encrypt(hashString, key);
  }
}
PaytmChecksum.iv = '@@@@&&&&####$$$$';
module.exports = PaytmChecksum;
