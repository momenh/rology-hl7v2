/*
 ------------------------
 (c) 2017-present Panates
 This file may be freely distributed under the MIT license.
*/

const {ArgumentError} = require('errorex');
const {capitalizeFirst, hl7Encode, hl7Decode} = require('./helpers');
const ParseError = require('./ParseError');
const {SUBCOMPONENT_SEPARATOR, COMPONENT_SEPARATOR} = require('./types');

class HL7FieldData {

  /**
   * @param {HL7Field} field
   * @param {Object} def
   * @param {Number} level
   * @param {Object} [customDict]
   * @param {Object} [customDict.fields]
   * @param {boolean} [ignoreParsingErrors]
   * @param {boolean} [encodeHl7DataTypes]
   */
  constructor(field, def, level, customDict, ignoreParsingErrors, encodeHl7DataTypes) {
    Object.defineProperty(this, '_field', {
      value: field,
      enumerable: false
    });
    this._def = def;
    this._level = level || 0;
    this._items = null;
    this._value = null;
    this._customDict = customDict;
    this._ignoreParsingErrors = ignoreParsingErrors;
    this._encodeHl7DataTypes = encodeHl7DataTypes;

    const dict = require('./dictionary/' + this.message.version);
    if (this._customDict && this._customDict.fields)
      dict.fields = {...dict.fields, ...this._customDict.fields};
    const fldDict = dict.fields[def.dt];
    /* istanbul ignore next */
    if (!fldDict)
      throw new ArgumentError('Unknown HL7 field (%s)', def.dt);
    if (fldDict.components) {
      for (const [i, c] of fldDict.components.entries()) {
        if (def.dt === 'TS' && c.dt === 'ST' && !i)
          this.defineComponent(i + 1, {
            dt: 'ST',
            dtMean: 'DTM',
            desc: c.desc,
            opt: c.opt,
            rep: c.rep
          });
        else
          this.defineComponent(i + 1, c);
      }
    }
  }

  defineComponent(sequence, def) {
    this._items = this._items || [];
    const index = sequence - 1;
    const comp = new HL7FieldData(this._field, def, 1, this._customDict, this._ignoreParsingErrors, this._encodeHl7DataTypes);
    Object.defineProperty(this, sequence, {
      get: () => this._items[index],
      enumerable: false
    });
    Object.defineProperty(this, capitalizeFirst(def.desc), {
      get: () => this._items[index],
      enumerable: false
    });
    this._items[index] = comp;
    return comp;
  }

  /**
   *
   * @return {HL7Field}
   */
  get field() {
    return this._field;
  }

  /**
   *
   * @return {HL7Segment}
   */
  get segment() {
    return this.field.segment;
  }

  /**
   *
   * @return {HL7Message}
   */
  get message() {
    return this.segment.message;
  }

  get value() {
    return this._items ? this._items[0].value : this._value;
  }

  set value(value) {
    if (this._items)
      this._items[0].value = value;
    else this._value = value;
  }

  get asHL7() {
    return this.toHL7();
  }

  set asHL7(v) {
    this.parse(v);
  }

  /**
   *
   * @param {*} value
   * @return {this}
   */
  setValue(value) {
    this.value = value;
    return this;
  }

  /**
   *
   * @param {string} hl7Text
   */
  parse(hl7Text) {
    if (!this._items) {
      if(this._encodeHl7DataTypes) {
        this._value = hl7Decode(hl7Text,
            this._def.dtMean || this._def.dt);
      } else {
        this._value = hl7Text;
      }
      return;
    }
    const sep = this._level ? SUBCOMPONENT_SEPARATOR : COMPONENT_SEPARATOR;
    const arr = hl7Text.split(sep);
    for (const [i, v] of arr.entries()) {
      try {
        if (i >= this._items.length) {
          this.defineComponent(i + 1, {
            dt: 'ST',
            desc: 'Component' + (i + 1),
            opt: 'O'
          });
        }
        this._items[i].parse(v);
      } catch (e) {
        if(this._ignoreParsingErrors) {
          this._items[i]._value = v;
          continue;
        }
        const err = (e instanceof ParseError) ? e : new ParseError(e);
        err.component = i + 1;
        throw err;
      }

    }
  }

  toHL7() {
    if (!this._items) {
      if(this._encodeHl7DataTypes) {
        return this._value ? hl7Encode(this._value, this._def.dtMean ||
            this._def.dt) : '';
      } else {
        return this._value ? this._value : '';
      }
    }
    let out = '';
    const sep = this._level ? SUBCOMPONENT_SEPARATOR : COMPONENT_SEPARATOR;
    let k = 0;
    for (let i = this._items.length - 1; i >= 0; i--) {
      const s = this._items[i].toHL7();
      if (k || s || this._items[i].value != null)
        out = (s || '') + (k++ ? sep : '') + out;
    }
    return out;
  }

}

module.exports = HL7FieldData;
