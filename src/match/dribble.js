import { PITCH } from '../config.js';

const { L, W, CH, R } = PITCH;
const EDGE = 0.45;      // од від борту: звідси гравець біля своєї межі (L − 1.3) ще дістає м'яч ногою (reach нижче)
const WALL_BACK = 0.45; // яку частку швидкості м'яч зберігає, відскочивши від борту в ногах
const WALL_MIN = 1;     // од/с: не менше цього м'яч іде від борту, щоб не лишитись там, де гравець його не дістане

function offWall(b, nx, nz) {
  const vn = b.vx * nx + b.vz * nz;
  if (vn >= WALL_MIN) return;
  const v = Math.max(WALL_MIN, -vn * WALL_BACK) - vn;
  b.vx += nx * v; b.vz += nz * v;
}

/**
 * М'яч у ногах (стан held) рухається поза World.integrate: тримаємо його в опуклій межі арени (вісімкутник, лінія воріт теж
 * межа). Біля борту м'яч плавно відскакує, а не телепортується, у стик зі стіною ставиться лише страховкою. Без алокацій.
 */
export function keepBallIn(b) {
  const qx = b.x < 0 ? -1 : 1, qz = b.z < 0 ? -1 : 1, ax = Math.abs(b.x), az = Math.abs(b.z);
  if (ax > L - EDGE) { if (ax > L - R) b.x = qx * (L - R); offWall(b, -qx, 0); }
  if (az > W - EDGE) { if (az > W - R) b.z = qz * (W - R); offWall(b, 0, -qz); }
  const cut = (Math.abs(b.x) + Math.abs(b.z) - (L + W - CH)) * Math.SQRT1_2;       // відстань за лінією зрізу кута
  if (cut > -EDGE) {
    if (cut > -R) { const k = (cut + R) * Math.SQRT1_2; b.x -= qx * k; b.z -= qz * k; }
    offWall(b, -qx * Math.SQRT1_2, -qz * Math.SQRT1_2);
  }
}

/**
 * Ведення м'яча дотиками, як у людини: м'яч не приклеєний до гравця, а котиться сам (з тертям трави), і гравець
 * підбиває його ногою — у мить, коли стопа ставиться поруч із м'ячем (крок ходи), або, якщо кроку довго нема, за часом.
 * Кожен дотик посилає м'яч у бажаний бік трохи швидше за гравця, тож той наздоганяє його й знову підбиває. Поворот
 * робиться ногою: м'яч продовжує котитись старим курсом, доки гравець не торкнеться його й не скерує по-новому.
 *
 * st — стан ведення гравця ({ t, steps }), p — Player, ball — {x, z, vx, vz}, (dx, dz) — бажаний напрямок (одиничний).
 * Повертає true, якщо цього кадру був дотик.
 */
export function dribbleStep(st, p, ball, dx, dz, dt) {
  const k = Math.exp(-dt * 1.4);                                       // трава гальмує м'яч між дотиками
  ball.vx *= k; ball.vz *= k; ball.x += ball.vx * dt; ball.z += ball.vz * dt;
  st.t = (st.t || 0) + dt;
  const steps = p.gaitSys ? p.gaitSys.steps : 0, newStep = steps !== st.steps; st.steps = steps;
  const rx = ball.x - p.x, rz = ball.z - p.z, d = Math.hypot(rx, rz), ahead = rx * dx + rz * dz;
  const ps = Math.hypot(p.mvx || p.vx || 0, p.mvz || p.vz || 0);
  // м'яч утік задалеко (зіткнення, телепорт) — повертаємо до ноги, щоб ведення не обривалось
  if (d > 3.2) { ball.x = p.x + dx * 0.8; ball.z = p.z + dz * 0.8; ball.vx = dx * ps; ball.vz = dz * ps; st.t = 0; return false; }
  const reach = 0.95, overrun = ahead < 0.25;                          // гравець наздогнав чи обігнав м'яч — підбиває одразу
  if (d < reach && st.t > 0.16 && (newStep || overrun || st.t > 0.55)) {
    // дотик: м'яч іде в бажаний бік трохи швидше за гравця; що далі він уже попереду, то легше підбиває
    const v = Math.max(2.2, ps * 1.15 + 1.2 - Math.max(0, ahead - 0.5) * 2.5);
    ball.vx = dx * v; ball.vz = dz * v; st.t = 0;
    // дотик робить та нога, що справді ближче до м'яча, а не просто з його боку
    const F = p.gaitSys ? p.gaitSys.feet : null;
    if (p.tapBall) p.tapBall(F ? (Math.hypot(F[1].x - ball.x, F[1].z - ball.z) < Math.hypot(F[0].x - ball.x, F[0].z - ball.z) ? 1 : 0) : rx * Math.cos(p.bodyYaw) - rz * Math.sin(p.bodyYaw) > 0 ? 1 : 0);
    return true;
  }
  return false;
}
