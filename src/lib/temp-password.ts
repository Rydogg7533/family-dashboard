import { randomInt } from "node:crypto";
// 14 characters from an alphabet without look-alikes (no 0/O, 1/l/I). About 70 bits. Shown once to a parent, never stored or logged.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const tempPassword = () => Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
