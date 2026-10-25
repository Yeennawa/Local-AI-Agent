// Deep Module: Linux Command Safety Guard
// Deterministic token-level validator preventing shell injection and dangerous operations.
// Zero shell execution, zero external dependencies.

import { execFile } from 'node:child_process';

const DESTRUCTIVE_BINARIES = new Set([
  'rm', 'dd', 'mkfs', 'mkfs.ext4', 'mkfs.vfat', 'fdisk', 'parted', 'gdisk',
  'reboot', 'shutdown', 'poweroff', 'halt', 'init', 'shred', 'wipefs', 'killall'
]);

const SENSITIVE_PATHS = [
  '/etc/shadow', '/etc/gshadow', '/etc/sudoers', '/etc/sudoers.d',
  '/root/.ssh', 'id_rsa', 'id_ed25519', 'id_ecdsa'
];

const READ_ONLY_BINARIES = new Set([
  'uname', 'uptime', 'date', 'whoami', 'id', 'w', 'hostname', 'hostnamectl',
  'df', 'du', 'lsblk', 'free', 'vmstat', 'swapon', 'zramctl', 'cat',
  'lscpu', 'lshw', 'lspci', 'lsusb', 'arch', 'ps', 'top', 'htop', 'pstree',
  'pgrep', 'ip', 'ifconfig', 'ss', 'netstat', 'ping', 'traceroute',
  'nslookup', 'dig', 'ls', 'find', 'grep', 'tail', 'head', 'wc', 'file', 'journalctl'
]);

const MODIFY_BINARIES = new Set([
  'mkdir', 'touch', 'cp', 'mv', 'chmod', 'chown',
  'systemctl', 'service', 'tar', 'gzip', 'zip', 'unzip'
]);

const verdict = (ok, risk, canExecute, binary, args, reason) => ({
  ok,
  risk,
  canExecute,
  binary,
  args,
  reasons: [reason]
});

function tokenizeCommand(cmdStr) {
  if (typeof cmdStr !== 'string') {
    return { ok: false, binary: '', args: [], hasChainedOperators: false, hasPipe: false, hasSubshell: false, rawTokens: [] };
  }

  const trimmed = cmdStr.trim();
  const hasChainedOperators = /(?:;|&&|\|\||&(?![^"']*")|>(?![^"']*")|<(?![^"']*"))/.test(trimmed);
  const hasPipe = /\|(?!\|)/.test(trimmed);
  const hasSubshell = /(?:\$\(|\`)/.test(trimmed);

  const tokens = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    tokens.push(match[1] !== undefined ? match[1] : (match[2] !== undefined ? match[2] : match[0]));
  }

  const binary = tokens.length > 0 ? tokens[0].toLowerCase().trim() : '';
  return {
    ok: Boolean(binary),
    binary,
    args: tokens.slice(1),
    hasChainedOperators,
    hasPipe,
    hasSubshell,
    rawTokens: tokens
  };
}

/**
 * Validates a Linux command string and determines its risk profile.
 *
 * @param {string} cmdStr - Command line string to analyze
 * @returns {{
 *   ok: boolean,
 *   risk: 'read' | 'modify' | 'destructive',
 *   canExecute: boolean,
 *   binary: string,
 *   args: string[],
 *   reasons: string[]
 * }}
 */
export function validateLinuxCommand(cmdStr) {
  if (!cmdStr || typeof cmdStr !== 'string') {
    return verdict(false, 'destructive', false, '', [], 'คำสั่งว่างเปล่าหรือไม่ถูกต้อง');
  }

  const trimmed = cmdStr.trim();

  // 1. Detect fork bomb signatures
  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(trimmed) || /:\{\s*:\|:&\s*\};:/.test(trimmed)) {
    return verdict(false, 'destructive', false, '', [], 'ตรวจพบ Fork Bomb ซึ่งอาจทำให้ระบบ Linux หยุดทำงาน');
  }

  // 2. Detect piped execution to shell or sudo
  if (/\|\s*(?:ba)?sh\b/i.test(trimmed) || /\|\s*sudo\b/i.test(trimmed)) {
    return verdict(false, 'destructive', false, '', [], 'ตรวจพบการ Pipe สคริปต์เข้าเชลล์โดยตรงซึ่งมีความเสี่ยงด้านความปลอดภัยสูง');
  }

  // 3. Tokenize command
  const parsed = tokenizeCommand(trimmed);
  if (!parsed.ok) {
    return verdict(false, 'destructive', false, '', [], 'ไม่สามารถแยกวิเคราะห์คำสั่งได้');
  }

  const { binary, args, hasChainedOperators, hasPipe, hasSubshell, rawTokens } = parsed;

  // 4. Check destructive binaries anywhere in the command tokens
  for (const tok of rawTokens) {
    const cleanTok = tok.toLowerCase().replace(/^sudo$/, '');
    if (DESTRUCTIVE_BINARIES.has(cleanTok)) {
      return verdict(false, 'destructive', false, binary, args, `คำสั่ง ${cleanTok} เป็นคำสั่งอันตรายที่มีผลกระทบต่อระบบหรือข้อมูล`);
    }
  }

  // 5. Check sensitive file paths
  const lowerCmd = trimmed.toLowerCase();
  for (const sensitive of SENSITIVE_PATHS) {
    if (lowerCmd.includes(sensitive.toLowerCase())) {
      return verdict(false, 'destructive', false, binary, args, `ไม่อนุญาตให้เข้าถึงไฟล์ระบบที่มีข้อมูลความลับ: ${sensitive}`);
    }
  }

  // 6. Block dangerous recursive permission/ownership changes on root
  if ((binary === 'chmod' || binary === 'chown') &&
      (/777\s+\/(?:\s|$)/.test(trimmed) || (/-[a-zA-Z]*R/.test(trimmed) && /\s\/(?:\s|$)/.test(trimmed)))) {
    return verdict(false, 'destructive', false, binary, args, `ไม่อนุญาตให้เปลี่ยนสิทธิ์หรือเจ้าของไฟล์ระดับรากของระบบ (${binary} /)`);
  }

  // 7. Reject subshells and command chaining (; && || & > <)
  if (hasSubshell || hasChainedOperators) {
    return verdict(false, 'destructive', false, binary, args, 'ไม่อนุญาตให้ใช้ตัวดำเนินการเชื่อมคำสั่งหรือ Subshell เพื่อป้องกันการแทรกคำสั่งอันตราย');
  }

  // 8. If command uses a single pipe (e.g. ps aux | head), allow display if primary binary is safe, but disable direct execFile
  if (hasPipe) {
    if (READ_ONLY_BINARIES.has(binary) || MODIFY_BINARIES.has(binary)) {
      return verdict(true, 'modify', false, binary, args, 'คำสั่งมีการเชื่อมต่อผ่าน Pipe แนะนำให้คัดลอกไปรันบนเทอร์มินัลด้วยตนเอง');
    }
    return verdict(false, 'destructive', false, binary, args, 'ไม่รู้จักคำสั่งหลักในไปป์ไลน์');
  }

  // 9. Safe read-only inspection
  if (READ_ONLY_BINARIES.has(binary)) {
    if (binary === 'cat') {
      const target = args[0] || '';
      const isSafeTarget = target.startsWith('/proc/') || target.startsWith('/sys/') || target.startsWith('/etc/os-release') || target.startsWith('/etc/issue');
      if (!isSafeTarget && (target.startsWith('/etc') || target.startsWith('/root'))) {
        return verdict(false, 'destructive', false, binary, args, 'คำสั่ง cat ถูกจำกัดให้อ่านเฉพาะข้อมูลระบบใน /proc, /sys และ os-release');
      }
    }
    return verdict(true, 'read', true, binary, args, 'คำสั่งตรวจสอบข้อมูลระบบแบบอ่านอย่างเดียว (ปลอดภัยสำหรับรันบนบอร์ด)');
  }

  // 10. System modification binaries
  if (MODIFY_BINARIES.has(binary)) {
    if (binary === 'systemctl' && (args[0] === 'status' || args[0] === 'is-active')) {
      return verdict(true, 'read', true, binary, args, 'ตรวจสอบสถานะ Service ของระบบ');
    }
    return verdict(true, 'modify', false, binary, args, 'คำสั่งมีการแก้ไขหรือปรับปรุงสถานะระบบ แนะนำให้ผู้ใช้นำไปใช้งานต่อด้วยตนเอง');
  }

  // 11. Reject unknown binaries outside the allowlists
  return verdict(false, 'destructive', false, binary, args, `คำสั่ง ${binary} ไม่อยู่ในรายการคำสั่งมาตรฐานที่อนุญาต`);
}

/**
 * Safely executes a validated read-only Linux command via execFile (shell: false).
 *
 * @param {string} commandStr
 * @returns {Promise<{ ok: boolean, status: number, body: Object }>}
 */
export async function executeLinuxCommand(commandStr) {
  const guard = validateLinuxCommand(commandStr);
  if (!guard.ok || !guard.canExecute || guard.risk !== 'read') {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        error: guard.reasons.join(' ') || 'ไม่อนุญาตให้รันคำสั่งนี้โดยตรงบนบอร์ด Pi',
        risk: guard.risk
      }
    };
  }

  const startMs = Date.now();
  return new Promise((resolve) => {
    execFile(
      guard.binary,
      guard.args,
      { timeout: 3000, maxBuffer: 4096, shell: false, windowsHide: true },
      (err, stdout, stderr) => {
        const durationMs = Date.now() - startMs;
        const cleanStdout = String(stdout || '').slice(0, 4096);
        const cleanStderr = String(stderr || '').slice(0, 4096);

        if (err && err.code === 'ENOENT' && process.platform === 'win32') {
          resolve({
            ok: true,
            status: 200,
            body: {
              ok: true,
              command: `${guard.binary} ${guard.args.join(' ')}`.trim(),
              stdout: `[จำลองสภาพแวดล้อมบน Windows Dev Host]\nคำสั่ง: ${guard.binary} ${guard.args.join(' ')}\nเมื่อรันบนบอร์ด Raspberry Pi 5 (Linux Kernel) จะแสดงผลลัพธ์จริงจากระบบปฏิบัติการ`,
              stderr: '',
              exitCode: 0,
              durationMs
            }
          });
          return;
        }

        resolve({
          ok: !err,
          status: 200,
          body: {
            ok: !err,
            command: `${guard.binary} ${guard.args.join(' ')}`.trim(),
            stdout: cleanStdout,
            stderr: cleanStderr || (err ? err.message : ''),
            exitCode: err && typeof err.code === 'number' ? err.code : (err ? 1 : 0),
            durationMs
          }
        });
      }
    );
  });
}
