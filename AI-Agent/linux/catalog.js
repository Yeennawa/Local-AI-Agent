// Deep Module: Linux Command Catalog (OS Lab Recipes)
// Pre-verified, deterministic catalog for standard Linux tasks.
// Zero token consumption, zero model calls, 100% accurate Thai explanations.

export const LINUX_RECIPES = [
  // ==========================================
  // 1. Process & Runqueue (OS Lab PCB) - Priority over generic memory
  // ==========================================
  {
    id: 'ps_sort_memory',
    patterns: [/(?:โพรเซส|process).*(?:กินแรม|ใช้แรม|memory)/i, /ps.*sort.*mem/i],
    command: 'ps aux --sort=-%mem | head -n 11',
    titleThai: 'แสดง 10 อันดับโพรเซสที่ใช้หน่วยความจำ RAM สูงสุด',
    explainThai: 'จัดเรียงรายการโพรเซสตาม %MEM จากมากไปน้อย ช่วยค้นหาโปรแกรมที่กำลังทำ Memory Leak',
    flags: [
      { flag: '--sort=-%mem', meaningThai: 'จัดเรียงผลลัพธ์ย้อนกลับ (มากไปน้อย) ตามการใช้งาน RAM' }
    ],
    risk: 'read',
    category: 'process',
    canExecute: false // contains pipe
  },
  {
    id: 'ps_sort_cpu',
    patterns: [/(?:โพรเซส|process).*(?:กิน cpu|ใช้ cpu)/i, /ps.*sort.*cpu/i],
    command: 'ps aux --sort=-%cpu | head -n 11',
    titleThai: 'แสดง 10 อันดับโพรเซสที่ใช้ประมวลผล CPU สูงสุด',
    explainThai: 'จัดเรียงโพรเซสตาม %CPU จากมากไปน้อย ช่วยค้นหาโปรแกรมที่กำลังทำงานหนักหรือเกิด Infinite Loop',
    flags: [
      { flag: '--sort=-%cpu', meaningThai: 'จัดเรียงผลลัพธ์ย้อนกลับ (มากไปน้อย) ตามการใช้งาน CPU' }
    ],
    risk: 'read',
    category: 'process',
    canExecute: false // contains pipe
  },
  {
    id: 'ps_aux_all',
    patterns: [/(?:ดูโพรเซส|process ทั้งหมด|ps aux|โปรเซสที่รันอยู่)/i],
    command: 'ps aux',
    titleThai: 'แสดงโพรเซสทั้งหมดที่กำลังทำงานในระบบ',
    explainThai: 'คำสั่ง ps แสดง Snapshot ของ Process Control Block (PCB) ทั้ง PID, %CPU, %MEM, สถานะ (STAT) และคำสั่งที่รัน',
    flags: [
      { flag: 'a', meaningThai: 'แสดงโพรเซสของผู้ใช้ทุกคน' },
      { flag: 'u', meaningThai: 'User-oriented format: แสดงชื่อผู้ใช้, %CPU และ %MEM' },
      { flag: 'x', meaningThai: 'แสดงโพรเซสที่ไม่ได้เชื่อมต่อกับเทอร์มินัล (daemons)' }
    ],
    risk: 'read',
    category: 'process',
    canExecute: true
  },
  {
    id: 'top_snapshot_batch',
    patterns: [/(?:top|สแนปช็อต top|ภาระงานปัจจุบัน)/i],
    command: 'top -b -n 1 | head -n 20',
    titleThai: 'จับภาพสถิติระบบและโพรเซสด้วยคำสั่ง top แบบ Batch Mode',
    explainThai: 'รัน top 1 รอบโดยไม่เปิดหน้าจอค้างไว้ เพื่ออ่านค่า CPU Tasks, Memory และโพรเซสแบบข้อความธรรมดา',
    flags: [
      { flag: '-b', meaningThai: 'Batch mode: ส่งออกผลลัพธ์เป็นข้อความมาตรฐานแทนการวาดหน้าจอแบบ Interactive' },
      { flag: '-n 1', meaningThai: 'Number of iterations: ประมวลผลและส่งออกข้อมูลเพียง 1 รอบแล้วสิ้นสุด' }
    ],
    risk: 'read',
    category: 'process',
    canExecute: false // contains pipe
  },
  {
    id: 'kill_process_graceful',
    patterns: [/(?:kill|ปิดโพรเซส|หยุดโพรเซส|terminate|สั่งปิดโปรแกรม)/i],
    command: 'kill -15 <PID>',
    titleThai: 'ส่งสัญญาณ SIGTERM ปิดโพรเซสอย่างนุ่มนวล',
    explainThai: 'ส่งสัญญาณหมายเลข 15 (SIGTERM) ไปยัง Process ID เพื่อเปิดโอกาสให้โปรแกรมเคลียร์ทรัพยากรและปิดตัวเองอย่างปลอดภัย',
    flags: [
      { flag: '-15', meaningThai: 'SIGTERM: สัญญาณแจ้งให้โพรเซสปิดตัวเองตามลำดับขั้นตอน' }
    ],
    risk: 'modify',
    category: 'process',
    canExecute: false
  },
  {
    id: 'pgrep_find_process',
    patterns: [/(?:pgrep|ค้นหา pid|หา process id ตามชื่อ)/i],
    command: 'pgrep -l <process_name>',
    titleThai: 'ค้นหา Process ID (PID) ตามชื่อโปรแกรม',
    explainThai: 'ค้นหาหมายเลข PID ของโปรแกรมที่ระบุพร้อมแสดงชื่อคำสั่ง',
    flags: [
      { flag: '-l', meaningThai: 'List name: แสดงชื่อของโพรเซสควบคู่กับหมายเลข PID' }
    ],
    risk: 'read',
    category: 'process',
    canExecute: true
  },

  // ==========================================
  // 2. Storage & Filesystem
  // ==========================================
  {
    id: 'disk_free_human',
    patterns: [/(?:เช็ค|ดู|ตรวจ|เหลือ).*(?:ดิสก์|เนื้อที่|disk|ความจุ|storage)/i, /df\s+-h/i, /check disk space/i],
    command: 'df -h',
    titleThai: 'ตรวจสอบพื้นที่ดิสก์ที่เหลือ (Human-readable)',
    explainThai: 'คำสั่ง df (Disk Free) รายงานการใช้งานพื้นที่ไฟล์ซิสเต็มทั้งหมด โดยแปลงขนาดเป็นหน่วยที่อ่านเข้าใจง่าย (GB, MB)',
    flags: [
      { flag: '-h', meaningThai: 'Human-readable: แสดงหน่วยแบบอ่านง่ายเป็น GB, MB แทนจำนวนบล็อกดิสก์' }
    ],
    risk: 'read',
    category: 'storage',
    canExecute: true
  },
  {
    id: 'disk_inode_usage',
    patterns: [/(?:inode|ไอโหนด).*(?:เต็ม|เหลือ|เช็ค|ดู)/i, /df\s+-i/i],
    command: 'df -i',
    titleThai: 'ตรวจสอบปริมาณการใช้งาน Inode ของไฟล์ซิสเต็ม',
    explainThai: 'รายงานจำนวน Inode ที่ใช้งานและที่ยังเหลืออยู่ ช่วยแก้ปัญหาบันทึกไฟล์ไม่ได้ทั้งที่พื้นที่ดิสก์ยังเหลือ',
    flags: [
      { flag: '-i', meaningThai: 'Inodes: แสดงจำนวนโครงสร้างข้อมูล Inode แทนพื้นที่บล็อก' }
    ],
    risk: 'read',
    category: 'storage',
    canExecute: true
  },
  {
    id: 'dir_size_summary',
    patterns: [/(?:ขนาด|เนื้อที่).*(?:โฟลเดอร์|folder|ไดเรกทอรี|directory)/i, /du\s+-sh/i],
    command: 'du -sh * | sort -h',
    titleThai: 'สรุปขนาดของโฟลเดอร์ในไดเรกทอรีปัจจุบันและเรียงลำดับ',
    explainThai: 'คำสั่ง du (Disk Usage) ประเมินขนาดโฟลเดอร์แต่ละอันและจัดเรียงจากน้อยไปมาก เพื่อหาจุดที่กินพื้นที่เครื่อง',
    flags: [
      { flag: '-s', meaningThai: 'Summary: แสดงเฉพาะผลรวมของแต่ละไดเรกทอรี' },
      { flag: '-h', meaningThai: 'Human-readable: แปลงเป็นหน่วย K, M, G' }
    ],
    risk: 'read',
    category: 'storage',
    canExecute: false // contains pipe
  },
  {
    id: 'list_block_devices',
    patterns: [/(?:บล็อกดีไวซ์|block device|lsblk|ไดรฟ์|sdcard|nvme)/i],
    command: 'lsblk -f',
    titleThai: 'แสดงรายการ Block Devices และ Filesystem UUID',
    explainThai: 'คำสั่ง lsblk แสดงแผนผังโครงสร้างของพื้นที่จัดเก็บข้อมูล ไดรฟ์ MicroSD, SSD พร้อม Filesystem Type และ Mount Point',
    flags: [
      { flag: '-f', meaningThai: 'Filesystem: แสดงประเภทไฟล์ซิสเต็ม เช่น ext4, vfat, f2fs และ UUID' }
    ],
    risk: 'read',
    category: 'storage',
    canExecute: true
  },

  // ==========================================
  // 2. Memory, RAM & ZRAM
  // ==========================================
  {
    id: 'memory_free_human',
    patterns: [/(?:เช็ค|ดู|ตรวจ|เหลือ).*(?:แรม|ram|memory|หน่วยความจำ)/i, /free\s+-h/i, /check ram/i],
    command: 'free -h',
    titleThai: 'ตรวจสอบการใช้งาน RAM และ Swap (Human-readable)',
    explainThai: 'คำสั่ง free รายงานสถานะหน่วยความจำ ทั้ง Total, Used, Free, Shared, Buffers/Cache และ Available',
    flags: [
      { flag: '-h', meaningThai: 'Human-readable: แสดงหน่วยเป็น MB, GB' }
    ],
    risk: 'read',
    category: 'memory',
    canExecute: true
  },
  {
    id: 'proc_meminfo_read',
    patterns: [/(?:meminfo|proc\/meminfo|สถิติแรมเคอร์เนล)/i],
    command: 'cat /proc/meminfo',
    titleThai: 'อ่านค่าสถิติหน่วยความจำโดยตรงจาก Linux Kernel',
    explainThai: 'อ่านไฟล์เสมือน /proc/meminfo เพื่อดูตัวเลขละเอียดระดับเคอร์เนล เช่น MemAvailable, Active(file), Dirty, ZRAM swap',
    flags: [],
    risk: 'read',
    category: 'memory',
    canExecute: true
  },
  {
    id: 'vmstat_memory_stats',
    patterns: [/(?:vmstat|virtual memory stat|เพจสลับ|สถิติ swap)/i],
    command: 'vmstat -s',
    titleThai: 'รายงานสถิติ Virtual Memory จากเคอร์เนล',
    explainThai: 'แสดงผลรวมของเหตุการณ์หน่วยความจำ เช่น จำนวน page faults, swap in/out และ buffer activity',
    flags: [
      { flag: '-s', meaningThai: 'Table summary: แสดงผลสรุปเป็นรายการบรรทัดอ่านง่าย' }
    ],
    risk: 'read',
    category: 'memory',
    canExecute: true
  },
  {
    id: 'zramctl_status',
    patterns: [/(?:zram|zramctl|การบีบอัด swap ใน ram)/i],
    command: 'zramctl',
    titleThai: 'ตรวจสอบสถานะอุปกรณ์ ZRAM Swap',
    explainThai: 'คำสั่ง zramctl แสดงอัตราการบีบอัดหน่วยความจำ (Compression Ratio) และขนาด RAM แท้ที่ประหยัดได้',
    flags: [],
    risk: 'read',
    category: 'memory',
    canExecute: true
  },
  {
    id: 'swapon_show',
    patterns: [/(?:swap|สว็อป|swapon).*(?:เปิด|สถานะ|ดู|เช็ค)/i],
    command: 'swapon --show',
    titleThai: 'แสดงพาร์ติชันและไฟล์ Swap ที่เปิดใช้งานอยู่',
    explainThai: 'รายงานพื้นที่ Swap ของระบบทั้งขนาด ขนาดที่ถูกใช้งานจริง และลำดับความสำคัญ (Priority)',
    flags: [
      { flag: '--show', meaningThai: 'แสดงตารางข้อมูลอุปกรณ์ Swap ทั้งหมด' }
    ],
    risk: 'read',
    category: 'memory',
    canExecute: true
  },

  // ==========================================
  // 3. CPU, SoC & Linux Kernel
  // ==========================================
  {
    id: 'cpu_hardware_info',
    patterns: [/(?:สเปก|ข้อมูล|สถาปัตยกรรม).*(?:cpu|ซีพียู|โปรเซสเซอร์)/i, /lscpu/i],
    command: 'lscpu',
    titleThai: 'แสดงสถาปัตยกรรมและข้อมูลฮาร์ดแวร์ CPU',
    explainThai: 'คำสั่ง lscpu รายงานสถาปัตยกรรมชิป (เช่น ARM Cortex-A76 บน Pi 5), จำนวน Core, ความถี่ MHz, L1/L2/L3 Cache',
    flags: [],
    risk: 'read',
    category: 'cpu',
    canExecute: true
  },
  {
    id: 'proc_cpuinfo_read',
    patterns: [/(?:cpuinfo|proc\/cpuinfo|โมเดลซีพียู)/i],
    command: 'cat /proc/cpuinfo',
    titleThai: 'อ่านรายละเอียด Core ซีพียูจาก /proc/cpuinfo',
    explainThai: 'อ่านข้อมูลฮาร์ดแวร์ซีพียูแต่ละ Core สดจากเคอร์เนล แสดง hardware revision และ serial number ของบอร์ด',
    flags: [],
    risk: 'read',
    category: 'cpu',
    canExecute: true
  },
  {
    id: 'kernel_uname_all',
    patterns: [/(?:เคอร์เนล|kernel|เวอร์ชัน linux|สเปกระบบ).*(?:uname|ตรวจ|ดู|เช็ค)/i, /uname\s+-a/i],
    command: 'uname -a',
    titleThai: 'ตรวจสอบข้อมูลเคอร์เนลและสถาปัตยกรรมระบบ',
    explainThai: 'รายงานชื่อ OS, Hostname, Kernel Release Version, วันที่คอมไพล์เคอร์เนล และ Machine Architecture (aarch64 / x86_64)',
    flags: [
      { flag: '-a', meaningThai: 'All: แสดงข้อมูลระบบปฏิบัติการและเคอร์เนลทั้งหมดที่มี' }
    ],
    risk: 'read',
    category: 'system',
    canExecute: true
  },
  {
    id: 'system_uptime_load',
    patterns: [/(?:uptime|เปิดเครื่องมากี่ชั่วโมง|ระยะเวลาทำงาน|โหลดเฉลี่ย)/i],
    command: 'uptime',
    titleThai: 'ตรวจสอบระยะเวลาเปิดเครื่อง (Uptime) และภาระงานเฉลี่ย',
    explainThai: 'คำสั่ง uptime แสดงเวลาปัจจุบัน, ระยะเวลาที่เปิดเครื่องต่อเนื่อง, จำนวนผู้ใช้ที่ล็อกอิน, และ Load Average 1, 5, 15 นาที',
    flags: [],
    risk: 'read',
    category: 'system',
    canExecute: true
  },
  {
    id: 'os_release_info',
    patterns: [/(?:distro|ดิสโทร|รุ่น os|os-release|debian|raspbian|ubuntu)/i],
    command: 'cat /etc/os-release',
    titleThai: 'ตรวจสอบชื่อและการกระจายตัวของ Linux Distribution',
    explainThai: 'อ่านไฟล์ /etc/os-release เพื่อตรวจสอบชื่อ OS เช่น Raspberry Pi OS (Bookworm), หมายเลขรุ่น และ Codename',
    flags: [],
    risk: 'read',
    category: 'system',
    canExecute: true
  },

  // ==========================================
  // 4. Kernel Stats, Logs & Diagnostics
  // ==========================================
  {
    id: 'proc_stat_ticks',
    patterns: [/(?:proc\/stat|สถิติ cpu ticks|สถิติโพรเซสเคอร์เนล)/i],
    command: 'cat /proc/stat',
    titleThai: 'อ่านสถิติ Ticks ของ CPU และ Kernel Context Switches',
    explainThai: 'อ่านค่า Jiffies/Ticks ของ CPU แต่ละคอร์ในสถานะ user, system, idle, iowait นำมาคำนวณภาระงาน CPU ใน OS Lab',
    flags: [],
    risk: 'read',
    category: 'system',
    canExecute: true
  },
  {
    id: 'dmesg_kernel_ring_buffer',
    patterns: [/(?:dmesg|เคอร์เนลริงบักเฟอร์|ข้อความบูตเครื่อง|kernel log)/i],
    command: 'dmesg -T | head -n 30',
    titleThai: 'ตรวจสอบ Kernel Ring Buffer และข้อความฮาร์ดแวร์ล่าสุด',
    explainThai: 'คำสั่ง dmesg แสดงบันทึกข้อความจากเคอร์เนล เช่น การตรวจพบไดรฟ์ USB, ปัญหาไฟตก Undervoltage หรือข้อผิดพลาดไดรเวอร์',
    flags: [
      { flag: '-T', meaningThai: 'Human-readable timestamps: แสดงเวลาเป็นวันที่และเวลาปกติแทนค่าวินาทีของเคอร์เนล' }
    ],
    risk: 'read',
    category: 'system',
    canExecute: false // contains pipe
  },
  {
    id: 'timedatectl_system_clock',
    patterns: [/(?:timedatectl|เวลาเครื่อง|โซนเวลา linux|ntp sync)/i],
    command: 'timedatectl',
    titleThai: 'ตรวจสอบเวลาของระบบ นาฬิกาฮาร์ดแวร์ (RTC) และสถานะ NTP',
    explainThai: 'แสดงเวลาท้องถิ่น, เวลามาตรฐานสากล (UTC), ไทม์โซนที่ตั้งค่า และสถานะการซิงก์เวลากับเซิร์ฟเวอร์ Network Time Protocol (NTP)',
    flags: [],
    risk: 'read',
    category: 'system',
    canExecute: true
  },
  {
    id: 'tail_file_follow',
    patterns: [/(?:tail -f|ติดตาม log สด|อ่านท้ายไฟล์)/i],
    command: 'tail -n 30 <filename>',
    titleThai: 'อ่าน 30 บรรทัดสุดท้ายของไฟล์ข้อความหรือ Log',
    explainThai: 'คำสั่ง tail อ่านข้อความช่วงท้ายของไฟล์ ช่วยตรวจดูผลลัพธ์การทำงานล่าสุดของโปรแกรม',
    flags: [
      { flag: '-n 30', meaningThai: 'Number of lines: แสดง 30 บรรทัดสุดท้าย' }
    ],
    risk: 'read',
    category: 'files',
    canExecute: true
  },

  // ==========================================
  // 5. Networking & Ports
  // ==========================================
  {
    id: 'ip_address_all',
    patterns: [/(?:ip address|ไอพี|ip a|ifconfig|ดู ip|เช็ค ip)/i],
    command: 'ip a',
    titleThai: 'ตรวจสอบที่อยู่ IP Address ของ Network Interfaces ทั้งหมด',
    explainThai: 'คำสั่ง ip แสดงข้อมูลการเชื่อมต่อเครือข่าย ทั้ง Ethernet (eth0), Wi-Fi (wlan0) และ Loopback (lo) พร้อม IPv4/IPv6',
    flags: [
      { flag: 'a', meaningThai: 'Address: แสดงข้อมูล Protocol Addresses ทั้งหมด' }
    ],
    risk: 'read',
    category: 'network',
    canExecute: true
  },
  {
    id: 'sockets_listening_ports',
    patterns: [/(?:พอร์ต|port|ss|netstat).*(?:เปิด|กำลังฟัง|listening|เช็ค)/i, /ss\s+-tulpn/i],
    command: 'ss -tulpn',
    titleThai: 'ตรวจสอบ Socket และ Port ที่กำลังเปิดรอรับการเชื่อมต่อ (Listening)',
    explainThai: 'คำสั่ง ss (Socket Statistics) แสดงพอร์ต TCP และ UDP ที่เปิดอยู่ พร้อมหมายเลข Port และ Process ที่ควบคุม',
    flags: [
      { flag: '-t', meaningThai: 'TCP: กรองเฉพาะ TCP Sockets' },
      { flag: '-u', meaningThai: 'UDP: กรองเฉพาะ UDP Sockets' },
      { flag: '-l', meaningThai: 'Listening: แสดงเฉพาะพอร์ตที่กำลังเปิดรอการเชื่อมต่อ' },
      { flag: '-p', meaningThai: 'Processes: แสดง Process ID และชื่อโปรแกรมที่ถือครองพอร์ต' },
      { flag: '-n', meaningThai: 'Numeric: แสดงหมายเลขพอร์ตเป็นตัวเลขแทนการแปลงเป็นชื่อบริการ' }
    ],
    risk: 'read',
    category: 'network',
    canExecute: true
  },
  {
    id: 'ip_route_table',
    patterns: [/(?:routing table|เส้นทางเน็ต|default gateway|ip route)/i],
    command: 'ip route',
    titleThai: 'แสดง Routing Table และ Default Gateway ของระบบ',
    explainThai: 'รายงานเส้นทางการส่งต่อแพ็กเก็ตข้อมูลของเครือข่าย เพื่อตรวจสอบว่า Gateway ชี้ไปที่ Router ถูกต้องหรือไม่',
    flags: [],
    risk: 'read',
    category: 'network',
    canExecute: true
  },
  {
    id: 'ping_network_connectivity',
    patterns: [/(?:ping|ทดสอบการเชื่อมต่อเน็ต|เช็คเน็ตว่าหลุดไหม)/i],
    command: 'ping -c 4 8.8.8.8',
    titleThai: 'ทดสอบการส่งแพ็กเก็ต ICMP ไปยังปลายทาง (Google DNS)',
    explainThai: 'ส่งสัญญาณ Ping 4 ครั้งเพื่อตรวจสอบ Latency และ Packet Loss สู่เครือข่ายอินเทอร์เน็ตภายนอก',
    flags: [
      { flag: '-c 4', meaningThai: 'Count: กำหนดให้ส่งแพ็กเก็ตเพียง 4 ครั้งแล้วสรุปผล ไม่ค้างคำสั่ง' }
    ],
    risk: 'read',
    category: 'network',
    canExecute: true
  },

  // ==========================================
  // 6. Files, Permissions & Navigation
  // ==========================================
  {
    id: 'list_directory_detailed',
    patterns: [/(?:ดูไฟล์|รายการไฟล์|ls -la|list file|เช็คสิทธิ์ไฟล์)/i],
    command: 'ls -la',
    titleThai: 'แสดงรายการไฟล์ทั้งหมดอย่างละเอียดรวมถึงไฟล์ซ่อน',
    explainThai: 'คำสั่ง ls แสดงรายชื่อไฟล์, สิทธิ์การเข้าถึง (Permissions), Owner, Group, ขนาด และเวลาแก้ไขล่าสุด',
    flags: [
      { flag: '-l', meaningThai: 'Long listing format: แสดงตารางสิทธิ์ เจ้าของ ขนาดไฟล์ และเวลา' },
      { flag: '-a', meaningThai: 'All: แสดงไฟล์ทั้งหมดรวมถึง Hidden Files ที่ขึ้นต้นด้วยจุด (.)' }
    ],
    risk: 'read',
    category: 'files',
    canExecute: true
  },
  {
    id: 'chmod_execute_permission',
    patterns: [/(?:chmod|เปลี่ยนสิทธิ์|ให้สิทธิ์รัน|permission).*(?:ไฟล์|สคริปต์|sh)/i],
    command: 'chmod 755 <filename>',
    titleThai: 'กำหนดสิทธิ์ไฟล์เป็น rwxr-xr-x (อ่าน/เขียน/รัน)',
    explainThai: 'กำหนดให้เจ้าของไฟล์อ่าน เขียน และรันได้ (7) ส่วนกลุ่มและบุคคลอื่นอ่านและรันได้เท่านั้น (5) นิยมใช้กับสคริปต์',
    flags: [
      { flag: '755', meaningThai: 'Octal Mode: Owner=rwx(7), Group=r-x(5), Others=r-x(5)' }
    ],
    risk: 'modify',
    category: 'files',
    canExecute: false
  },
  {
    id: 'chown_user_group',
    patterns: [/(?:chown|เปลี่ยนเจ้าของ|เปลี่ยน owner|กรรมสิทธิ์ไฟล์)/i],
    command: 'chown user:group <filename>',
    titleThai: 'เปลี่ยนผู้ครอบครอง (Owner) และกลุ่มของไฟล์',
    explainThai: 'คำสั่ง chown (Change Owner) ใช้ปรับเปลี่ยนความเป็นเจ้าของไฟล์ให้แก่ผู้ใช้และกลุ่มที่ระบุ',
    flags: [],
    risk: 'modify',
    category: 'files',
    canExecute: false
  },
  {
    id: 'find_files_by_name',
    patterns: [/(?:find|ค้นหาไฟล์|หาไฟล์ตามชื่อ)/i],
    command: 'find . -name "*.log"',
    titleThai: 'ค้นหาไฟล์ตามชื่อและนามสกุลในไดเรกทอรีปัจจุบัน',
    explainThai: 'คำสั่ง find สแกนโครงสร้างโฟลเดอร์แบบ Recursive เพื่อค้นหาไฟล์ที่มีชื่อตรงกับเงื่อนไขที่กำหนด',
    flags: [
      { flag: '-name', meaningThai: 'กำหนดรูปแบบชื่อไฟล์ที่ต้องการค้นหา (รองรับ Wildcard)' }
    ],
    risk: 'read',
    category: 'files',
    canExecute: true
  },
  {
    id: 'grep_search_text',
    patterns: [/(?:grep|ค้นหาข้อความในไฟล์|หาคำในไฟล์)/i],
    command: 'grep -rn "keyword" .',
    titleThai: 'ค้นหาข้อความภายในไฟล์ทุกไฟล์ในไดเรกทอรีปัจจุบัน',
    explainThai: 'คำสั่ง grep สแกนหาคำศัพท์ที่ต้องการ พร้อมบอกชื่อไฟล์และหมายเลขบรรทัดที่พบคำนั้น',
    flags: [
      { flag: '-r', meaningThai: 'Recursive: ค้นหาเจาะลึกเข้าไปในโฟลเดอร์ย่อยทั้งหมด' },
      { flag: '-n', meaningThai: 'Line number: แสดงหมายเลขบรรทัดที่พบคำค้น' }
    ],
    risk: 'read',
    category: 'files',
    canExecute: true
  },
  {
    id: 'tar_create_archive',
    patterns: [/(?:บีบอัด|รวมไฟล์|tar|archive|สร้าง zip|สร้าง tar)/i],
    command: 'tar -czvf archive.tar.gz folder/',
    titleThai: 'รวมและบีบอัดไฟล์เป็นคลังข้อมูล .tar.gz (Gzip)',
    explainThai: 'คำสั่ง tar รวมโฟลเดอร์และบีบอัดด้วยอัลกอริทึม Gzip เพื่อความสะดวกในการสำรองข้อมูลหรือถ่ายโอน',
    flags: [
      { flag: '-c', meaningThai: 'Create: สร้างไฟล์ archive ใหม่' },
      { flag: '-z', meaningThai: 'Gzip: บีบอัดข้อมูลด้วย gzip' },
      { flag: '-v', meaningThai: 'Verbose: แสดงรายชื่อไฟล์ขณะกำลังบีบอัด' },
      { flag: '-f', meaningThai: 'File: ระบุชื่อไฟล์ปลายทาง' }
    ],
    risk: 'modify',
    category: 'files',
    canExecute: false
  },

  // ==========================================
  // 7. Systemd Services & Logs
  // ==========================================
  {
    id: 'systemctl_status_service',
    patterns: [/(?:systemctl status|สถานะ service|เช็ค service|บริการของระบบ)/i],
    command: 'systemctl status <service_name>',
    titleThai: 'ตรวจสอบสถานะการทำงานของ Systemd Service',
    explainThai: 'รายงานสถานะของ Service ว่ากำลังทำงาน (active/running), หยุดทำงาน (inactive), หรือล้มเหลว (failed) พร้อม Log ล่าสุด',
    flags: [],
    risk: 'read',
    category: 'service',
    canExecute: true
  },
  {
    id: 'systemctl_restart_service',
    patterns: [/(?:restart service|รีสตาร์ท service|รีบูต service)/i],
    command: 'systemctl restart <service_name>',
    titleThai: 'รีสตาร์ตการทำงานของ Systemd Service',
    explainThai: 'หยุดและเริ่มการทำงานของ Service ใหม่ เพื่อให้โหลดการตั้งค่าหรือกู้คืนจากข้อผิดพลาด',
    flags: [],
    risk: 'modify',
    category: 'service',
    canExecute: false
  },
  {
    id: 'journalctl_service_logs',
    patterns: [/(?:journalctl|ดู log service|ล็อกการทำงานของระบบ)/i],
    command: 'journalctl -u <service_name> -n 50 --no-pager',
    titleThai: 'อ่าน Log บันทึกเหตุการณ์ของ Service ย้อนหลัง 50 บรรทัด',
    explainThai: 'อ่าน Systemd Journal Log ของ Service ที่เจาะจง ช่วยวิเคราะห์สาเหตุเมื่อ Service ทำงานผิดพลาด',
    flags: [
      { flag: '-u', meaningThai: 'Unit: กรองเฉพาะ Service Unit ที่ระบุ' },
      { flag: '-n 50', meaningThai: 'Number: แสดงเฉพาะ 50 บรรทัดล่าสุด' },
      { flag: '--no-pager', meaningThai: 'ส่งผลลัพธ์ออกจอภาพตรงๆ โดยไม่เข้าโปรแกรม pager' }
    ],
    risk: 'read',
    category: 'service',
    canExecute: true
  },

  // ==========================================
  // 8. Users & Environment
  // ==========================================
  {
    id: 'whoami_current_user',
    patterns: [/(?:whoami|ฉันคือใคร|ผู้ใช้ปัจจุบัน|user ปัจจุบัน)/i],
    command: 'whoami',
    titleThai: 'ตรวจสอบชื่อผู้ใช้ที่กำลังล็อกอินใช้งานอยู่ในขณะนี้',
    explainThai: 'พิมพ์ชื่อ Effective Username ของ Session ปัจจุบัน',
    flags: [],
    risk: 'read',
    category: 'system',
    canExecute: true
  },
  {
    id: 'user_id_groups',
    patterns: [/(?:uid|gid|กลุ่มผู้ใช้|สิทธิ์ user|คำสั่ง id)/i],
    command: 'id',
    titleThai: 'แสดง User ID (UID), Group ID (GID) และกลุ่มที่สังกัด',
    explainThai: 'คำสั่ง id รายงานตัวตนด้านความปลอดภัยของโพรเซส รวมถึงสิทธิ์ในกลุ่มต่างๆ เช่น sudo, dialout, audio',
    flags: [],
    risk: 'read',
    category: 'system',
    canExecute: true
  }
];

/**
 * Matches a user query against the curated Linux recipe catalog.
 *
 * @param {string} query
 * @returns {Object|null}
 */
export function matchLinuxCatalog(query) {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();

  for (const recipe of LINUX_RECIPES) {
    for (const pattern of recipe.patterns) {
      if (pattern.test(trimmed)) {
        return recipe;
      }
    }
  }

  return null;
}
