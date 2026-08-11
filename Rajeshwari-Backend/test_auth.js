const jwt = require('jsonwebtoken');

async function test() {
  const token = jwt.sign({ id: 6, role: 'ADMIN' }, 'rajeshwari_dev_secret_key');
  console.log("Token:", token);
  
  const res = await fetch('http://localhost:5000/users', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body:", text);
}
test();
