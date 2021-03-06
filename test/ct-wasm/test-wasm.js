'use strict';
const common = require('../common');
const assert = require('assert');
const {readFile} = require('fs');
const {promisify} = require('util');
const readFileAsync = promisify(readFile);

common.crashOnUnhandledRejection();

async function instance(fname, i) {
  let f = await readFileAsync(__dirname + '/' + fname);
  return await WebAssembly.instantiate(f, i);
}

async function testPubSum() {
  let m = await instance('i32.wasm', {});
  let s = m.instance.exports.add(1,2);
  assert(s === 3, 'addition is broken');
}

async function testS32Sum() {
  let m = await instance('s32.wasm', {});
  let s = m.instance.exports.add(3,4);
  assert(s === 7, 'secret addition is broken');
  assert(m.instance.exports.add_one(5) === 6, 'secret addition is broken');
}

async function testS64() {
  let m = await instance('s64.wasm', {});
}

async function testSecretMem() {
  let m = await instance('secret_memory.wasm', {});
  let e = m.instance.exports;
  assert(e.load_at_zero() === 0, 's32 load is broken');
  e.store_at_zero();
  assert(e.load_at_zero() === 2, 's32 [something] is broken');

  let client = await instance('sec_memory_client.wasm', { lib: m.instance.exports });

  await instance('memory_client.wasm', { lib: m.instance.exports })
    .then(() => assert.fail("public memory client linked with secret memory lib"))
    .catch(() => { });

  let pub_memory = await instance('memory_lib.wasm', {});
  await instance('sec_memory_client.wasm', { lib: pub_memory.instance.exports })
    .then(() => assert.fail("secret memory client linked with public memory lib"))
    .catch(() => { });

  let mem = new WebAssembly.Memory({
    initial: 1,
    secret: true,
  })
  let imp = await instance('import-memory.wasm', { lib: { mem } });

  imp.instance.exports.write(4, 67);
  let view = new Uint32Array(mem.buffer);
  assert.equal(view[1], 67, "Operation on imported secret memory failed");
}

async function tests32linking() {
  let ilib = await instance('i32-lib.wasm', {});
  let slib = await instance('s32-lib.wasm', {});
  let sclient = await instance('s32-client.wasm', {lib: slib.instance.exports});

  await instance('s32-client.wasm', {lib: ilib.instance.exports})
    .then(() => assert.fail("s32 client linked with i32 lib"))
    .catch(()=>{});
  await instance('i32-client.wasm', {lib: slib.instance.exports})
    .then(() => assert.fail("i32 client linked with s32 lib"))
    .catch(()=>{});
}

async function testTrusted() {
  let lib = await instance("trusted_lib.wasm", {});
  let cli = await instance("trusted_client.wasm", { lib: lib.instance.exports });
  await instance('untrusted_client.wasm', { lib: { trusted() { } } })
    .then(() => assert.fail("Incorrectly allowed a js function to fulfill an untrusted import"))
    .catch(() => { });

  await instance('untrusted_client.wasm', {lib: lib.instance.exports})
    .then(() => assert.fail("Trusted function provided for untrusted import"))
    .catch(()=>{});

}

async function testClassification() {
  let lib = await instance("classification.wasm", {});
  assert.equal(lib.instance.exports.invokeTrusted(), 5);

  await instance('trusted_from_untrusted.wasm', {})
    .then(() => assert.fail("Trusted function called from untrusted func"))
    .catch(()=>{});

  await instance('declassify_from_untrusted.wasm', {})
    .then(() => assert.fail("Declassify called from untrusted func"))
    .catch(()=>{});
}

async function testSecretSelect() {
  let lib = await instance('secret_select.wasm', {});
  assert.equal(lib.instance.exports.secret_select(3, 4, 1), 3);
  assert.equal(lib.instance.exports.secret_select(2, 5, 0), 5);

  await instance('secret_select_err.wasm', {})
    .then(() => assert.fail("Selected public value with secret condition"))
    .catch(()=>{});

}


Promise.all([
  testS64(),
  testPubSum(),
  testS32Sum(),
  tests32linking(),
  testSecretMem(),
  testTrusted(),
  testClassification(),
  testSecretSelect(),
]).then(common.mustCall());
