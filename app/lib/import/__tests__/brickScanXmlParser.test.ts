import { parseBrickScanXml } from '../brickScanXmlParser';

describe('parseBrickScanXml', () => {
  it('parses parts and minifigs from XML', () => {
    const xml = `<INVENTORY>
      <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>11</COLOR><QTY>2</QTY></ITEM>
      <ITEM><ITEMTYPE>M</ITEMTYPE><ITEMID>sw0166</ITEMID><COLOR>0</COLOR><QTY>1</QTY></ITEM>
    </INVENTORY>`;
    const result = parseBrickScanXml(xml);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual({
      blPartId: '3001',
      blColorId: 11,
      quantity: 2,
    });
    expect(result.minifigs).toHaveLength(1);
    expect(result.minifigs[0]).toEqual({ blMinifigId: 'sw0166', quantity: 1 });
  });

  it('handles xml declaration', () => {
    const xml =
      '<?xml version="1.0"?><INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>11</COLOR><QTY>1</QTY></ITEM></INVENTORY>';
    const result = parseBrickScanXml(xml);
    expect(result.parts).toHaveLength(1);
  });

  it('defaults quantity to 1 if missing', () => {
    const xml =
      '<INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>11</COLOR></ITEM></INVENTORY>';
    const result = parseBrickScanXml(xml);
    expect(result.parts[0]!.quantity).toBe(1);
  });

  it('warns on items with missing ITEMID', () => {
    const xml =
      '<INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE><COLOR>11</COLOR><QTY>1</QTY></ITEM></INVENTORY>';
    const result = parseBrickScanXml(xml);
    expect(result.parts).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns empty for empty inventory', () => {
    const result = parseBrickScanXml('<INVENTORY></INVENTORY>');
    expect(result.parts).toHaveLength(0);
    expect(result.minifigs).toHaveLength(0);
  });
});
