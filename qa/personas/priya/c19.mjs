import { openApp } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const p = app.page;
const t = await p.evaluate(()=>[...document.querySelectorAll("*")].filter(e=>e.children.length===0 && e.textContent.includes("Skilled in capacity planning")).map(e=>e.textContent));
console.log(t);
await app.close();
