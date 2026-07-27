import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoxedCustomFieldValue } from './boxedCustomField.js';

describe('parseBoxedCustomFieldValue', () => {
    it('treats only 1 as boxed', () => {
        assert.equal(parseBoxedCustomFieldValue('1'), true);
        assert.equal(parseBoxedCustomFieldValue(1), true);
    });

    it('treats everything else as not boxed', () => {
        assert.equal(parseBoxedCustomFieldValue('0'), false);
        assert.equal(parseBoxedCustomFieldValue(0), false);
        assert.equal(parseBoxedCustomFieldValue('true'), false);
        assert.equal(parseBoxedCustomFieldValue('false'), false);
        assert.equal(parseBoxedCustomFieldValue('yes'), false);
        assert.equal(parseBoxedCustomFieldValue(''), false);
        assert.equal(parseBoxedCustomFieldValue(undefined), false);
    });
});
