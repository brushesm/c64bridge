/**
 * 6502/6510 disassembler for VICE memory inspection.
 * Handles all official MOS 6502 opcodes.
 */

const enum Mode {
  Imp,   // implied          1 byte
  Acc,   // accumulator A    1 byte
  Imm,   // #$xx             2 bytes
  Zp,    // $xx              2 bytes
  ZpX,   // $xx,X            2 bytes
  ZpY,   // $xx,Y            2 bytes
  Rel,   // $xxxx (branch)   2 bytes
  Abs,   // $xxxx            3 bytes
  AbsX,  // $xxxx,X          3 bytes
  AbsY,  // $xxxx,Y          3 bytes
  Ind,   // ($xxxx)          3 bytes
  IndX,  // ($xx,X)          2 bytes
  IndY,  // ($xx),Y          2 bytes
}

interface OpcodeEntry {
  mnem: string;
  mode: Mode;
}

// Full official MOS 6502 opcode table (undefined entries = illegal/NOP)
const OPCODES: Array<OpcodeEntry | undefined> = new Array(256);

function op(byte: number, mnem: string, mode: Mode): void {
  OPCODES[byte] = { mnem, mode };
}

// ADC
op(0x69, "ADC", Mode.Imm);  op(0x65, "ADC", Mode.Zp);   op(0x75, "ADC", Mode.ZpX);
op(0x6D, "ADC", Mode.Abs);  op(0x7D, "ADC", Mode.AbsX); op(0x79, "ADC", Mode.AbsY);
op(0x61, "ADC", Mode.IndX); op(0x71, "ADC", Mode.IndY);
// AND
op(0x29, "AND", Mode.Imm);  op(0x25, "AND", Mode.Zp);   op(0x35, "AND", Mode.ZpX);
op(0x2D, "AND", Mode.Abs);  op(0x3D, "AND", Mode.AbsX); op(0x39, "AND", Mode.AbsY);
op(0x21, "AND", Mode.IndX); op(0x31, "AND", Mode.IndY);
// ASL
op(0x0A, "ASL", Mode.Acc);  op(0x06, "ASL", Mode.Zp);   op(0x16, "ASL", Mode.ZpX);
op(0x0E, "ASL", Mode.Abs);  op(0x1E, "ASL", Mode.AbsX);
// Branches
op(0x90, "BCC", Mode.Rel);  op(0xB0, "BCS", Mode.Rel);  op(0xF0, "BEQ", Mode.Rel);
op(0x30, "BMI", Mode.Rel);  op(0xD0, "BNE", Mode.Rel);  op(0x10, "BPL", Mode.Rel);
op(0x50, "BVC", Mode.Rel);  op(0x70, "BVS", Mode.Rel);
// BIT
op(0x24, "BIT", Mode.Zp);   op(0x2C, "BIT", Mode.Abs);
// BRK
op(0x00, "BRK", Mode.Imp);
// CMP family
op(0xC9, "CMP", Mode.Imm);  op(0xC5, "CMP", Mode.Zp);   op(0xD5, "CMP", Mode.ZpX);
op(0xCD, "CMP", Mode.Abs);  op(0xDD, "CMP", Mode.AbsX); op(0xD9, "CMP", Mode.AbsY);
op(0xC1, "CMP", Mode.IndX); op(0xD1, "CMP", Mode.IndY);
op(0xE0, "CPX", Mode.Imm);  op(0xE4, "CPX", Mode.Zp);   op(0xEC, "CPX", Mode.Abs);
op(0xC0, "CPY", Mode.Imm);  op(0xC4, "CPY", Mode.Zp);   op(0xCC, "CPY", Mode.Abs);
// Clear/Set flags
op(0x18, "CLC", Mode.Imp);  op(0xD8, "CLD", Mode.Imp);  op(0x58, "CLI", Mode.Imp);
op(0xB8, "CLV", Mode.Imp);  op(0x38, "SEC", Mode.Imp);  op(0xF8, "SED", Mode.Imp);
op(0x78, "SEI", Mode.Imp);
// DEC/INC
op(0xC6, "DEC", Mode.Zp);   op(0xD6, "DEC", Mode.ZpX);  op(0xCE, "DEC", Mode.Abs);
op(0xDE, "DEC", Mode.AbsX); op(0xCA, "DEX", Mode.Imp);  op(0x88, "DEY", Mode.Imp);
op(0xE6, "INC", Mode.Zp);   op(0xF6, "INC", Mode.ZpX);  op(0xEE, "INC", Mode.Abs);
op(0xFE, "INC", Mode.AbsX); op(0xE8, "INX", Mode.Imp);  op(0xC8, "INY", Mode.Imp);
// EOR
op(0x49, "EOR", Mode.Imm);  op(0x45, "EOR", Mode.Zp);   op(0x55, "EOR", Mode.ZpX);
op(0x4D, "EOR", Mode.Abs);  op(0x5D, "EOR", Mode.AbsX); op(0x59, "EOR", Mode.AbsY);
op(0x41, "EOR", Mode.IndX); op(0x51, "EOR", Mode.IndY);
// JMP / JSR
op(0x4C, "JMP", Mode.Abs);  op(0x6C, "JMP", Mode.Ind);
op(0x20, "JSR", Mode.Abs);
// LDA
op(0xA9, "LDA", Mode.Imm);  op(0xA5, "LDA", Mode.Zp);   op(0xB5, "LDA", Mode.ZpX);
op(0xAD, "LDA", Mode.Abs);  op(0xBD, "LDA", Mode.AbsX); op(0xB9, "LDA", Mode.AbsY);
op(0xA1, "LDA", Mode.IndX); op(0xB1, "LDA", Mode.IndY);
// LDX
op(0xA2, "LDX", Mode.Imm);  op(0xA6, "LDX", Mode.Zp);   op(0xB6, "LDX", Mode.ZpY);
op(0xAE, "LDX", Mode.Abs);  op(0xBE, "LDX", Mode.AbsY);
// LDY
op(0xA0, "LDY", Mode.Imm);  op(0xA4, "LDY", Mode.Zp);   op(0xB4, "LDY", Mode.ZpX);
op(0xAC, "LDY", Mode.Abs);  op(0xBC, "LDY", Mode.AbsX);
// LSR
op(0x4A, "LSR", Mode.Acc);  op(0x46, "LSR", Mode.Zp);   op(0x56, "LSR", Mode.ZpX);
op(0x4E, "LSR", Mode.Abs);  op(0x5E, "LSR", Mode.AbsX);
// NOP
op(0xEA, "NOP", Mode.Imp);
// ORA
op(0x09, "ORA", Mode.Imm);  op(0x05, "ORA", Mode.Zp);   op(0x15, "ORA", Mode.ZpX);
op(0x0D, "ORA", Mode.Abs);  op(0x1D, "ORA", Mode.AbsX); op(0x19, "ORA", Mode.AbsY);
op(0x01, "ORA", Mode.IndX); op(0x11, "ORA", Mode.IndY);
// Stack
op(0x48, "PHA", Mode.Imp);  op(0x08, "PHP", Mode.Imp);
op(0x68, "PLA", Mode.Imp);  op(0x28, "PLP", Mode.Imp);
// ROL / ROR
op(0x2A, "ROL", Mode.Acc);  op(0x26, "ROL", Mode.Zp);   op(0x36, "ROL", Mode.ZpX);
op(0x2E, "ROL", Mode.Abs);  op(0x3E, "ROL", Mode.AbsX);
op(0x6A, "ROR", Mode.Acc);  op(0x66, "ROR", Mode.Zp);   op(0x76, "ROR", Mode.ZpX);
op(0x6E, "ROR", Mode.Abs);  op(0x7E, "ROR", Mode.AbsX);
// RTI / RTS
op(0x40, "RTI", Mode.Imp);  op(0x60, "RTS", Mode.Imp);
// SBC
op(0xE9, "SBC", Mode.Imm);  op(0xE5, "SBC", Mode.Zp);   op(0xF5, "SBC", Mode.ZpX);
op(0xED, "SBC", Mode.Abs);  op(0xFD, "SBC", Mode.AbsX); op(0xF9, "SBC", Mode.AbsY);
op(0xE1, "SBC", Mode.IndX); op(0xF1, "SBC", Mode.IndY);
// STA
op(0x85, "STA", Mode.Zp);   op(0x95, "STA", Mode.ZpX);  op(0x8D, "STA", Mode.Abs);
op(0x9D, "STA", Mode.AbsX); op(0x99, "STA", Mode.AbsY); op(0x81, "STA", Mode.IndX);
op(0x91, "STA", Mode.IndY);
// STX / STY
op(0x86, "STX", Mode.Zp);   op(0x96, "STX", Mode.ZpY);  op(0x8E, "STX", Mode.Abs);
op(0x84, "STY", Mode.Zp);   op(0x94, "STY", Mode.ZpX);  op(0x8C, "STY", Mode.Abs);
// Transfers
op(0xAA, "TAX", Mode.Imp);  op(0xA8, "TAY", Mode.Imp);  op(0xBA, "TSX", Mode.Imp);
op(0x8A, "TXA", Mode.Imp);  op(0x9A, "TXS", Mode.Imp);  op(0x98, "TYA", Mode.Imp);

function modeSize(mode: Mode): number {
  switch (mode) {
    case Mode.Imp:
    case Mode.Acc:
      return 1;
    case Mode.Imm:
    case Mode.Zp:
    case Mode.ZpX:
    case Mode.ZpY:
    case Mode.Rel:
    case Mode.IndX:
    case Mode.IndY:
      return 2;
    case Mode.Abs:
    case Mode.AbsX:
    case Mode.AbsY:
    case Mode.Ind:
      return 3;
  }
}

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, "0");
}

function hex4(v: number): string {
  return v.toString(16).toUpperCase().padStart(4, "0");
}

function labelOrHex4(addr: number, symbols: ReadonlyMap<number, string> | undefined): string {
  const label = symbols?.get(addr);
  return label ? `${label} ($${hex4(addr)})` : `$${hex4(addr)}`;
}

function formatOperand(
  mode: Mode,
  bytes: Uint8Array,
  offset: number,
  instrAddr: number,
  symbols: ReadonlyMap<number, string> | undefined,
): string {
  switch (mode) {
    case Mode.Imp:
      return "";
    case Mode.Acc:
      return "A";
    case Mode.Imm:
      return `#$${hex2(bytes[offset + 1] ?? 0)}`;
    case Mode.Zp:
      return `$${hex2(bytes[offset + 1] ?? 0)}`;
    case Mode.ZpX:
      return `$${hex2(bytes[offset + 1] ?? 0)},X`;
    case Mode.ZpY:
      return `$${hex2(bytes[offset + 1] ?? 0)},Y`;
    case Mode.Rel: {
      const rel = bytes[offset + 1] ?? 0;
      const signed = rel >= 0x80 ? rel - 0x100 : rel;
      const target = (instrAddr + 2 + signed) & 0xffff;
      return labelOrHex4(target, symbols);
    }
    case Mode.Abs: {
      const lo = bytes[offset + 1] ?? 0;
      const hi = bytes[offset + 2] ?? 0;
      const addr = lo | (hi << 8);
      return labelOrHex4(addr, symbols);
    }
    case Mode.AbsX: {
      const lo = bytes[offset + 1] ?? 0;
      const hi = bytes[offset + 2] ?? 0;
      const addr = lo | (hi << 8);
      return `${labelOrHex4(addr, symbols)},X`;
    }
    case Mode.AbsY: {
      const lo = bytes[offset + 1] ?? 0;
      const hi = bytes[offset + 2] ?? 0;
      const addr = lo | (hi << 8);
      return `${labelOrHex4(addr, symbols)},Y`;
    }
    case Mode.Ind: {
      const lo = bytes[offset + 1] ?? 0;
      const hi = bytes[offset + 2] ?? 0;
      const addr = lo | (hi << 8);
      return `($${hex4(addr)})`;
    }
    case Mode.IndX:
      return `($${hex2(bytes[offset + 1] ?? 0)},X)`;
    case Mode.IndY:
      return `($${hex2(bytes[offset + 1] ?? 0)}),Y`;
  }
}

export interface DisassemblyLine {
  readonly address: number;
  readonly bytes: readonly number[];
  readonly label: string | undefined;
  readonly mnemonic: string;
  readonly operand: string;
}

/**
 * Disassemble a block of 6502/6510 bytes.
 *
 * @param bytes       Raw memory bytes (may be longer than needed)
 * @param baseAddress The C64 memory address of `bytes[0]`
 * @param count       Max number of instructions to decode (default: decode until bytes exhausted)
 * @param symbols     Optional address->label map for operand annotation
 */
export function disassemble(
  bytes: Uint8Array,
  baseAddress: number,
  count?: number,
  symbols?: ReadonlyMap<number, string>,
): DisassemblyLine[] {
  const lines: DisassemblyLine[] = [];
  let offset = 0;
  const limit = count ?? Infinity;

  while (offset < bytes.length && lines.length < limit) {
    const instrAddr = (baseAddress + offset) & 0xffff;
    const opcode = bytes[offset] ?? 0;
    const entry = OPCODES[opcode];

    const label = symbols?.get(instrAddr);

    if (!entry) {
      lines.push({
        address: instrAddr,
        bytes: [opcode],
        label,
        mnemonic: "???",
        operand: `$${hex2(opcode)}`,
      });
      offset += 1;
      continue;
    }

    const size = modeSize(entry.mode);
    const instrBytes: number[] = [];
    for (let i = 0; i < size && offset + i < bytes.length; i++) {
      instrBytes.push(bytes[offset + i] ?? 0);
    }

    const operand = formatOperand(entry.mode, bytes, offset, instrAddr, symbols);

    lines.push({
      address: instrAddr,
      bytes: instrBytes,
      label,
      mnemonic: entry.mnem,
      operand,
    });

    offset += size;
  }

  return lines;
}

/**
 * Render disassembly lines as a human-readable string.
 * Format: [label:\n] $ADDR  XX XX XX  MNEM operand
 */
export function formatDisassembly(lines: DisassemblyLine[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    if (line.label) {
      parts.push(`${line.label}:`);
    }
    const addrStr = `$${hex4(line.address)}`;
    const byteStr = line.bytes.map((b) => hex2(b)).join(" ").padEnd(8);
    const instrStr = line.operand
      ? `${line.mnemonic} ${line.operand}`
      : line.mnemonic;
    parts.push(`  ${addrStr}  ${byteStr}  ${instrStr}`);
  }
  return parts.join("\n");
}
