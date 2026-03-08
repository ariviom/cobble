import { detectFormat } from '../formatDetector';

describe('detectFormat', () => {
  it('detects Brick Party .bp JSON', () => {
    const content = JSON.stringify({
      version: 1,
      app: 'brick-party',
      data: {},
    });
    expect(detectFormat(content)).toBe('brick-party');
  });

  it('detects BrickScan XML', () => {
    expect(detectFormat('<INVENTORY><ITEM></ITEM></INVENTORY>')).toBe(
      'brickscan-xml'
    );
  });

  it('detects BrickScan XML with xml declaration', () => {
    expect(detectFormat('<?xml version="1.0"?><INVENTORY></INVENTORY>')).toBe(
      'brickscan-xml'
    );
  });

  it('detects BrickScan CSV by headers', () => {
    expect(detectFormat('ITEMTYPE,ITEMID,COLOR,QTY\nP,3001,11,1')).toBe(
      'brickscan-csv'
    );
  });

  it('detects BrickScan CSV case-insensitively', () => {
    expect(detectFormat('itemtype,itemid,color,qty\nP,3001,11,1')).toBe(
      'brickscan-csv'
    );
  });

  it('detects Rebrickable set list CSV', () => {
    expect(detectFormat('Set Number,Quantity\n75192-1,1')).toBe(
      'rebrickable-sets'
    );
  });

  it('returns null for unrecognized content', () => {
    expect(detectFormat('random text')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectFormat('')).toBeNull();
  });
});
