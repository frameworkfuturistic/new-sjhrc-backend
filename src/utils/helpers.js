// utils/helpers.js
const moment = require('moment');

/**
 * Generate unique MRNo
 * @param {Object} Patient - The Patient model
 * @returns {Promise<string>} Generated MRNo
 */
async function generateMRNo(Patient) {
  const baseMRNo = 'OL' + moment().format('MMDDHHmm'); // e.g., OL04211530
  let MRNo = baseMRNo;
  let counter = 1;

  while (await Patient.MRNoExists(MRNo)) {
    MRNo = baseMRNo + counter;

    // Ensure MRNo doesn't exceed 10 characters
    if (MRNo.length > 10) {
      MRNo = MRNo.substring(0, 10);
    }

    counter++;

    if (counter > 100) {
      throw new Error(
        'Could not generate a unique MRNo. Please try again later.'
      );
    }
  }

  return MRNo;
}

module.exports = {
  generateMRNo,
};
