import { createStore } from './store/store.js';
import { mount } from './ui/app.js';

const q = new URLSearchParams(location.search).get('seed');
const seed = q || Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const store = createStore({});
store.dispatch('NewMatch', { seed });
window.__store = store;
mount(document.getElementById('app'), store);
