// /js/utils.js
export const formatSize = (size) => {
  return new Intl.NumberFormat().format(size);
};

export const formatDateTime = (date) => {
  const now = new Date();
  const hours24 = date.getHours();
  const hours = hours24 % 12 || 12;
  const minutes = ("0" + date.getMinutes()).slice(-2);
  const ampm = hours24 < 12 ? 'am' : 'pm';
  const dateString =
    (date.getMonth() + 1) +
    '/' +
    date.getDate() +
    (now.getFullYear() !== date.getFullYear() ? '/' + date.getFullYear() : '');
  return dateString + ' ' + hours + ':' + minutes + ampm;
};