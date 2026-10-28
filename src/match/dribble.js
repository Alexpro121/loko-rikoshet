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
  const reach = 1.15, overrun = ahead < 0.25;                          // гравець наздогнав чи обігнав м'яч — підбиває одразу
  if (d < reach && st.t > 0.16 && (newStep || overrun || st.t > 0.55)) {
    // дотик: м'яч іде в бажаний бік трохи швидше за гравця; що далі він уже попереду, то легше підбиває
    const v = Math.max(2.2, ps * 1.15 + 1.2 - Math.max(0, ahead - 0.5) * 2.5);
    ball.vx = dx * v; ball.vz = dz * v; st.t = 0;
    if (p.tapBall) p.tapBall(rx * Math.cos(p.bodyYaw) - rz * Math.sin(p.bodyYaw) > 0 ? 1 : 0);   // нога з боку м'яча
    return true;
  }
  return false;
}
