import { describe, it, expect } from 'vitest';
import { ComponentType } from 'discord.js';
import {
  getRawModalComponents,
  findModalComponent,
  getCheckboxValues,
  getRoleSelectValues,
  getRadioValue,
} from '../../src/util/modal.js';

// Helper to create a Label-wrapped component matching discord.js's transformed format
function makeLabelComponent(customId: string, extra: Record<string, unknown> = {}) {
  return {
    type: ComponentType.Label,
    component: { customId, ...extra },
  };
}

describe('getRawModalComponents', () => {
  it('extracts components from the interaction object', () => {
    const components = [{ type: 18 }];
    const interaction = { components } as never;
    expect(getRawModalComponents(interaction)).toBe(components);
  });
});

describe('findModalComponent', () => {
  it('finds component inside Label wrapper by customId', () => {
    const components = [makeLabelComponent('test_id', { values: ['a'] })];
    const result = findModalComponent(components as never, 'test_id');
    expect(result).toBeDefined();
    expect((result as { customId: string }).customId).toBe('test_id');
  });

  it('returns undefined when customId not found', () => {
    const components = [makeLabelComponent('other_id')];
    expect(findModalComponent(components as never, 'missing')).toBeUndefined();
  });

  it('returns undefined for empty components array', () => {
    expect(findModalComponent([] as never, 'test')).toBeUndefined();
  });

  it('finds the correct component among multiple', () => {
    const components = [
      makeLabelComponent('first', { values: ['x'] }),
      makeLabelComponent('second', { values: ['y'] }),
    ];
    const result = findModalComponent(components as never, 'second');
    expect((result as { values: string[] }).values).toEqual(['y']);
  });
});

describe('getCheckboxValues', () => {
  it('extracts string array from CheckboxGroup', () => {
    const components = [makeLabelComponent('choices', { values: ['a', 'b'] })];
    expect(getCheckboxValues(components as never, 'choices')).toEqual(['a', 'b']);
  });

  it('returns empty array when component missing', () => {
    expect(getCheckboxValues([] as never, 'missing')).toEqual([]);
  });

  it('returns empty array when values is undefined', () => {
    const components = [makeLabelComponent('choices', {})];
    expect(getCheckboxValues(components as never, 'choices')).toEqual([]);
  });

  it('returns single value array', () => {
    const components = [makeLabelComponent('mode', { values: ['single'] })];
    expect(getCheckboxValues(components as never, 'mode')).toEqual(['single']);
  });
});

describe('getRoleSelectValues', () => {
  it('extracts role IDs from RoleSelect', () => {
    const components = [makeLabelComponent('roles', { values: ['role1', 'role2'] })];
    expect(getRoleSelectValues(components as never, 'roles')).toEqual(['role1', 'role2']);
  });

  it('returns empty array when missing', () => {
    expect(getRoleSelectValues([] as never, 'roles')).toEqual([]);
  });
});

describe('getRadioValue', () => {
  it('extracts single value from RadioGroup', () => {
    const components = [makeLabelComponent('radio', { value: 'choice' })];
    expect(getRadioValue(components as never, 'radio')).toBe('choice');
  });

  it('returns null when component missing', () => {
    expect(getRadioValue([] as never, 'radio')).toBeNull();
  });

  it('returns null when value is undefined', () => {
    const components = [makeLabelComponent('radio', {})];
    expect(getRadioValue(components as never, 'radio')).toBeNull();
  });
});
