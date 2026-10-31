// Answers the filing step understands (kept out of the "use server" file, which may export only async functions).
export const FILE_YES = "Yes, file it";
export const FILE_CLAIM = "File it and open a reimbursement claim";
export const FILE_NO = "Not quite";
// A statement the checks held back (duplicate month, page and file name disagree, ...): the person may still file it, knowing why it was held.
export const FILE_ANYWAY = "File it anyway";
// Near match (same vendor, date within a day, amount close): the person decides.
export const FILE_SAME = "Same purchase, attach it";
export const FILE_DIFFERENT = "Different purchase, file it";
// A vehicle receipt cannot be filed without a vehicle; this is the honest way out: it was never a vehicle receipt.
export const NOT_VEHICLE = "Not a vehicle receipt";
