const net = require('net');

const DOMAIN_REGEX = /^(?=.{1,253}$)(?!.*\.\.)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

function normalizeDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return '';
  }

  return domain
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

function isValidDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  const normalized = normalizeDomain(domain);
  return DOMAIN_REGEX.test(normalized);
}

function isValidIPv4(ip) {
  return net.isIPv4(ip);
}

function isValidIPv6(ip) {
  return net.isIPv6(ip);
}

function isValidIP(ip) {
  return net.isIP(ip) !== 0;
}

module.exports = {
  normalizeDomain,
  isValidDomain,
  isValidIPv4,
  isValidIPv6,
  isValidIP,
};
