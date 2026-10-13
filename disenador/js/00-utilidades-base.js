'use strict';
const $=s=>document.querySelector(s);
const f=v=>+(+v).toFixed(2);
const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const STORAGE_KEY='estandartes.v1';
