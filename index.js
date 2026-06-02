'use strict';

const { version: platformVersion } = require('zapier-platform-core');
const { version } = require('./package.json');

const authentication = require('./src/auth');

// Searches (read operations)
const fetchOrderList = require('./src/searches/fetchOrderList');
const fetchPaymentLinks = require('./src/searches/fetchPaymentLinks');
const fetchTransactionsForLink = require('./src/searches/fetchTransactionsForLink');
const fetchRefundList = require('./src/searches/fetchRefundList');
const listRefunds = require('./src/searches/listRefunds');
const checkRefundStatus = require('./src/searches/checkRefundStatus');
const fetchSubscriptionStatus = require('./src/searches/fetchSubscriptionStatus');
const settlementTxnListByDate = require('./src/searches/settlementTxnListByDate');
const settlementBillList = require('./src/searches/settlementBillList');
const orderDetail = require('./src/searches/orderDetail');

// Creates (write / mutation operations)
const createPaymentLink = require('./src/creates/createPaymentLink');
const initiateRefund = require('./src/creates/initiateRefund');
const pauseResumeSubscription = require('./src/searches/pauseResumeSubscription');
const cancelSubscription = require('./src/searches/cancelSubscription');
const customApiCall = require('./src/creates/customApiCall');

// Triggers (hidden polling sources for dynamic dropdowns)
const ordersDropdown = require('./src/triggers/ordersDropdown');
const paymentLinksDropdown = require('./src/triggers/paymentLinksDropdown');
const refundsDropdown = require('./src/triggers/refundsDropdown');

const App = {
  version,
  platformVersion,
  authentication,

  searches: {
    [fetchOrderList.key]: fetchOrderList,
    [fetchPaymentLinks.key]: fetchPaymentLinks,
    [fetchTransactionsForLink.key]: fetchTransactionsForLink,
    [fetchRefundList.key]: fetchRefundList,
    [listRefunds.key]: listRefunds,
    [checkRefundStatus.key]: checkRefundStatus,
    [fetchSubscriptionStatus.key]: fetchSubscriptionStatus,
    [settlementTxnListByDate.key]: settlementTxnListByDate,
    [settlementBillList.key]: settlementBillList,
    [orderDetail.key]: orderDetail,
  },

  creates: {
    [createPaymentLink.key]: createPaymentLink,
    [initiateRefund.key]: initiateRefund,
    [pauseResumeSubscription.key]: pauseResumeSubscription,
    [cancelSubscription.key]: cancelSubscription,
    [customApiCall.key]: customApiCall,
  },

  triggers: {
    [ordersDropdown.key]: ordersDropdown,
    [paymentLinksDropdown.key]: paymentLinksDropdown,
    [refundsDropdown.key]: refundsDropdown,
  },
};

module.exports = App;
