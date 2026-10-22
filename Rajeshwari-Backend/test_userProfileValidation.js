const test = require('node:test');
const assert = require('node:assert');
const { z } = require('zod');

// Copying the schema here for isolated testing of the validation logic
const userProfileUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").optional(),
  phone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
});

test('userProfileUpdateSchema', async (t) => {
  await t.test('accepts valid optional fields', () => {
    const result = userProfileUpdateSchema.safeParse({
      name: 'John Doe',
      phone: '1234567890',
      address: '123 Street',
      city: 'City',
      state: 'State',
      pincode: '123456'
    });
    assert.strictEqual(result.success, true);
  });

  await t.test('accepts empty payload', () => {
    const result = userProfileUpdateSchema.safeParse({});
    assert.strictEqual(result.success, true);
  });

  await t.test('accepts nulls for fields except name', () => {
    const result = userProfileUpdateSchema.safeParse({
      phone: null,
      address: null,
      city: null,
      state: null,
      pincode: null
    });
    assert.strictEqual(result.success, true);
  });

  await t.test('rejects empty name string', () => {
    const result = userProfileUpdateSchema.safeParse({
      name: '  '
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.issues[0].message, 'Name cannot be empty');
  });

  await t.test('rejects unexpected types', () => {
    const result = userProfileUpdateSchema.safeParse({
      phone: 1234567890 // should be string
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.issues[0].code, 'invalid_type');
  });
});
