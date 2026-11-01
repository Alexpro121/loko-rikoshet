# Карта коду

Згенеровано `npm run docs:map`, руками не правити. Запис `назва:рядок` веде до оголошення в цьому файлі.
Рядки зсуваються з кожною правкою: якщо карта застаріла, перегенеруй її або шукай за назвою.

## src/club.js (61 рядків)

Ідентичність ФК «Локомотив» Київ: історія, символіка, факти. Джерела: Вікіпедія (FC Lokomotyv Kyiv),

- Експорти: CLUB:4, CHRONICLE:15, FACTS:31, LEGENDS:43, ALUMNI:44, HONOURS:46, STADIUM:51, randomFact:61

## src/config.js (171 рядків)

Усі числові константи гри в одному місці.

- Експорти: PITCH:3, PHYS:18, COL:33, KIT_LOKO:40, KITS:42, KIT_GK_LOKO:47, LEAGUES:56, FORMATIONS:70, FIXTURES:80, matchSpec:86, STRIKERS:109, shotSkill:119, KEEPERS:121, ACADEMY:129, STADIUM_TIERS:149, STADIUM_TIER_NAMES:150, SETTINGS_DEFAULT:152, CAM_PRESETS:164

## src/core/audio.js (198 рядків)

Увесь звук синтезується на льоту (WebAudio): жодних файлів, нуль завантаження.

- Експорти: audio:194, vibrate:196
- **AudioEngine** :4
  constructor:5, unlock:16, applySettings:39, suspend:46, resume:48, tone:51, hiss:64, kick:78, wall:82, coin:90, pass:95, save:96, whistle:97, horn:107, goal:120, concede:125, bell:129, rumble:133, click:134, back:135, buy:136, deny:137, win:138, lose:139, slowmo:141, beat:145, slide:146, clap:147, thud:148, startCrowd:150, crowd:158, music:164, schedule:173

## src/core/camera.js (304 рядків)

CamDirector: ігрова камера матчу за пресетами CAM_PRESETS (config.js); кадрує м'яч і важливих гравців.

- Експорти: camPreset:17, pathPoint:24, camInfoBlank:34
- **CamDirector** :48
  constructor:49, snap:63, add:65, nearest:68, collect:82, need:116, needOne:125, solve:131, bounds:144, update:166, keepIn:290

## src/core/game.js (425 рядків)

Game: рендерер, сцена меню, стейт-машина MENU/MATCH/GOAL/RESULT, головний цикл, ввід, камера матчу, якість.

- Експорти: gfxFail:19
- **Game** :29
  constructor:30, cineFlat:75, ensureMatch:87, buildStates:90, play:129, toMenu:133, quitMatch:134, onStadiumUpgraded:136, resize:141, basePixelRatio:152, applyPixelRatio:161, governor:172, onGlLost:198, onGlRestored:205, onVisibility:211, updateMenuCam:218, computeMatchBase:232, snapCamera:233, addTrauma:235, fovKick:237, updateMatchCam:239, autoFocus:296, screenToGround:310, worldToScreen:321, acquireWake:328, floatWorld:337, bindInput:344, isFullscreen:390, enterFullscreen:391, toggleFullscreen:398, tick:404

## src/core/stateMachine.js (17 рядків)

Мінімальна стейт-машина: MENU / MATCH / GOAL / RESULT.

- **StateMachine** :2
  constructor:3, add:5, go:7, update:16

## src/graphics/ball.js (88 рядків)

BallView: видимий м'яч (меш, обертання); стан м'яча живе у physics/world.js.

- Внутрішні функції: ballGeometry:10
- **BallView** :38
  constructor:39, squash:56, update:65

## src/graphics/cinefx.js (102 рядків)

CineFX: постобробка кат-сцен (кінофокус) через EffectComposer; game.js має запасний звичайний рендер.

- **CineFX** :51
  constructor:52, verify:71, resize:82, render:84

## src/graphics/gait.js (516 рядків)

Gait: процедурна хода гравця (стопи в світі, ритм, рівновага); викликається з Player.animate.

- Експорти: HUMAN:40
- Внутрішні функції: osc:50
- **Gait** :58
  constructor:60, reset:78, update:98, hip:450, liftOff:456, touchDown:463, footGap:475, landPsi:481, phaseAngle:487, liftOf:490, legIK:493, measure:505

## src/graphics/island.js (478 рядків)

Island: острів у меню: стадіон за ярусами прокачки, потяг, кубки, небо.

- Внутрішні функції: stand:12, buildLoop:35
- **Island** :50
  constructor:51, buildBase:66, buildTrack:119, buildStadium:134, buildTrophy:299, setTrophies:327, buildSky:335, buildTrain:362, trackAt:369, setTier:380, dust:396, celebrate:404, update:409

## src/graphics/logo.js (9 рядків)

Справжня емблема клубу (public/loko-logo.svg), завантажується один раз і ділиться між текстурами.

- Експорти: logoReady:7, logoImg:8, whenLogo:9

## src/graphics/particles.js (89 рядків)

Particles: пул частинок без алокацій (голи, удари, конфеті).

- **Particles** :10
  constructor:11, emit:30, burst:42, update:50, clear:88

## src/graphics/pitch.js (196 рядків)

buildPitch: газон, розмітка, борти, ворота й сітки матчу; OUTLINE — контур арени.

- Експорти: OUTLINE:13, buildPitch:35
- Внутрішні функції: lineSeg:15, insetPolygon:20

## src/graphics/player.js (2432 рядків)

Player: воксельна модель гравця, усі анімації (Player.animate), IK рук і ніг, пози воротаря.

- Експорти: angDiff:21, GK_STRIKE:47, diveKin:89
- Внутрішні функції: accent:68, jumpPhase:69, atlasMat:108, printMat:118, hairBlock:233, headGeo:295, bodyGeo:317
- **Player** :351
  constructor:353, setLook:429, setExpr:448, setMode:458, kick:459, backLeg:470, cheer:480, react:492, sad:499, reach:513, engage:515, solveReach:521, poleIK:554, bodyGuard:577, impulse:622, jolt:626, gesture:632, tapBall:641, faceNow:643, control:648, receive:654, chest:660, header:661, block:662, hit:663, tackle:665, stumble:672, downed:677, stagger:682, knock:691, dropRag:705, slideTackle:712, kneel:713, rest:715, bakeSlide:717, hug:719, gkDive:721, diveReset:726, setAim:727, startPDive:734, planDive:748, startPKick:782, gkJump:783, saveSide:785, gkPunch:793, gkTip:795, gkFoot:797, gkStar:799, parry:804, ballAt:814, perceive:828, catchBall:846, catchMk:853, gkKnee:859, gkFall:861, throwBall:862, setThreat:863, fendAt:865, hipTurn:874, jostle:901, rise:904, animate:934, groundGuard:1978, diveTakeoff:2000, armGuard:2028, hitbox:2095, handsIK:2128, plantFeet:2355, solveArms:2408

## src/graphics/ragdoll.js (401 рядків)

Ragdoll: падіння гравця як система точок Верле; вмикається з Player.knock.

- Експорти: ragPoints:39
- Внутрішні функції: ptsOf:47, blendQ:356, basisQ:358, hingeQ:372, legQ:396
- **Ragdoll** :53
  constructor:64, com:95, setDrive:103, frame:119, step:127, limitKnees:223, minDist:236, limitLegs:248, legLim:265, limitBody:278, closest:287, segSep:298, nudge:315, faceDown:318, apply:326

## src/graphics/stands.js (334 рядків)

Stands: трибуни й глядачі на InstancedMesh, реакції натовпу, банери, прапори, сектор гостей.

- Внутрішні функції: bannerAtlas:13, waveMat:37
- **Stands** :53
  constructor:54, buildBanners:153, buildFlags:175, buildAway:191, setOpponent:210, react:230, cheer:234, chantEnv:237, writeMatrices:243, update:285, runFlashes:322

## src/graphics/surround.js (122 рядків)

buildSurround: усе поза трибунами матчу: земля, оточення, поїзд у кольорах Локо.

- Експорти: buildSurround:50
- Внутрішні функції: canvasTex:11, facadeTexture:19, windowsTexture:39

## src/graphics/textures.js (258 рядків)

Текстури, намальовані на canvas: атлас гравця (обличчя, номери), газон, борти, сітка, тінь, вивіски.

- Експорти: ANISO:7, cellRect:30, faceCell:34, numberCell:40, sponsorCell:46, crestCell:47, playerAtlas:50, grassTexture:149, boardTexture:177, netTexture:223, netPlane:232, shadowTexture:240, signTexture:251
- Внутрішні функції: canvas:9, tex:15

## src/graphics/train.js (35 рядків)

Воксельні локомотив і вагони для острова в меню.

- Експорти: LOCO_LEN:5, locoMesh:10, wagonMesh:26

## src/graphics/tunnel.js (41 рядків)

buildTunnel: тунель виходу команд на стадіоні матчу.

- Експорти: buildTunnel:13

## src/graphics/voxel.js (103 рядків)

VoxelBuilder: зливає куби в один меш із вершинними кольорами; матеріали, shade, сідований rng.

- Експорти: vcMat:80, lambert:86, shade:93, rng:100
- **VoxelBuilder** :16
  constructor:17, geo:20, box:44, shape:52, build:59, mesh:71

## src/graphics/weather.js (41 рядків)

Weather: дощ і сніг на InstancedMesh.

- **Weather** :9
  constructor:10, set:23, update:28

## src/lab/lab.css (34 рядків)

Стилі сторінки лабораторії (lab.html).

- Розділи: Стилі сторінки лабораторії (lab.html).:1

## src/lab/lab.js (542 рядків)

Лабораторія гравця (lab.html): окрема сторінка для перевірки моделі, ходи й анімацій; window.lab у консолі.

- Внутрішні функції: spawn:87, setWire:106, setJoints:115, start:129, divePrep:165, gkShot:175, stepBall:198, steer:232, tick:260, resize:344, setCam:360, renderCams:370, btn:378, row:379, select:380, range:385, swatches:390, check:395, renderPanel:401, test:459, actions:506

## src/main.js (32 рядків)

Точка входу основної гри: шрифти, склад, UI, Game, онлайн-екран, сервіс-воркер.

- Внутрішні функції: boot:12

## src/match/brain.js (405 рядків)

TeamBrain: командне мислення ШІ. Читання гри, лінії блоку, опіка без дублів, ролі без м'яча, сигнал рукою; оцінки удару, паса й ведення.

- Експорти: JOB:8, laneDist:29, zoneValue:48, shotQuality:58, passRisk:78, pickCarry:95
- Внутрішні функції: add:26, nearest:41
- **TeamBrain** :115
  constructor:116, reset:118, read:125, setLines:153, defSpot:171, gaps:178, assignRest:194, countJobs:209, assignMarks:216, updateCalls:245, hand:276, afterPass:290, pickJob:295, place:357

## src/match/cinema.js (187 рядків)

Кат-сценні інструменти: Replay (запис і повтор поз), Slaps («дай п'ять»), рукостискання.

- Експорти: shakeHands:106, patShoulder:116
- **Replay** :16
  constructor:17, clear:28, idx:29, t0:30, t1:31, rec:33, write:39, blend:48, apply:71, cut:81, applyClip:90, saveLive:97, restoreLive:98
- **Slaps** :133
  constructor:134, busy:135, of:136, add:138, clear:145, update:146, move:162

## src/match/dribble.js (28 рядків)

- Експорти: dribbleStep:10

## src/match/match.js (2948 рядків)

Match: уся логіка матчу: фази, ввід удару, м'яч, відбори, воротарі, голи, кат-сцени, нагороди. Огляд: docs/ARCHITECTURE.md.

- **Match** :49
  constructor:50, start:92, formation:152, kickFor:193, timeText:196, periodBound:202, gameMin:203, overMin:205, extraText:206, minuteLabel:212, stoppage:218, ballFlying:223, calmBall:225, whistlePeriod:233, setClockHud:234, halfText:240, gkWaitBlock:248, pointerDown:250, joyStart:265, joyMove:273, pointerMove:275, pointerUp:277, hideAim:291, cancelAim:292, kickErr:298, shotMul:299, updateAim:301, cutAimAtMates:369, onWall:385, onPost:395, onBody:404, saveReact:467, controlScore:484, claimBall:505, tackleChance:525, addXp:527, showCard:530, bump:540, startTackle:552, updateTackles:568, resolveTackle:588, looseBall:621, placeBallAt:636, trapMine:644, makeReady:658, trapOpp:673, clearReceivers:691, laneClear:694, choosePass:710, longTarget:740, passTo:757, kickYaw:770, carries:776, carry:783, kickApproach:808, kickReady:826, dribbleKick:836, kickFollow:850, doPass:863, launchFor:881, startShot:890, takerThink:909, updateTaker:935, matesTackle:1031, releaseCounter:1043, remoteCtl:1057, gkHoldNow:1059, remoteWaiting:1060, remoteAimPose:1063, remoteHold:1070, remoteKick:1085, remoteRelease:1095, pickOppReceiver:1112, ricochetGoal:1134, pickMyReceiver:1140, launchShot:1161, onGoal:1183, updateGoal:1229, afterGoal:1242, update:1250, nextPeriod:1296, timeOver:1307, procLead:1323, procAt:1335, driveIntro:1350, laneStep:1439, postStep:1471, skipIntroPart:1505, crowdBox:1521, detour:1533, steerAround:1556, introSeparate:1576, setGaze:1594, endIntro:1595, introCam:1609, clearCine:1649, startPens:1660, camInfo:1668, camOverride:1679, markMoment:1693, storeClip:1699, takeMoments:1707, startHighlights:1711, playClips:1717, nextClip:1722, updateClip:1733, endClips:1746, replayCam:1752, skipCine:1763, startBreak:1772, updateBreak:1784, endBreak:1804, breakCam:1809, assignEndRoles:1824, endShake:1867, endCam:1901, clearSlow:1924, updateSlow:1927, checkTackles:1951, tackleReady:1964, updateDanger:1972, tick:1984, resolvePlayers:2092, updateSlides:2143, startSlide:2184, onSlideContact:2194, keeperCollect:2218, facesBall:2238, inGloves:2252, gkReceive:2271, gkRush:2284, startSmother:2299, resolveSmother:2310, updateKeepers:2323, goalImportance:2463, setupCelebration:2484, celebView:2502, fanBurst:2518, updateCelebration:2524, fallbackPick:2640, updateHolder:2657, keeperBodies:2690, updateSolidity:2710, animatePlayers:2721, syncView:2734, netBulge:2793, floatAt:2809, pause:2812, resume:2813, isPlaying:2814, endCelebrate:2817, endTalk:2854, end:2877, exit:2938

## src/match/penalty.js (449 рядків)

Penalties: серія пенальті: своя панель, приціл, стрибок воротаря, 3D-політ м'яча.

- **Penalties** :21
  constructor:22, start:24, build:38, dots:76, keeperMove:86, camOverride:99, setMark:107, placeMark:116, begin:125, decide:150, fire:168, announce:185, verdict:197, update:212, liveStep:221, ballStep:312, judge:409, endKick:422, dispose:434, unbindKeys:435, post:438, finish:440

## src/match/team.js (486 рядків)

Actor (гравець у логіці) і Team (рух ШІ: хто на м'яч, виконання рішень TeamBrain, воротар).

- Внутрішні функції: ballAt:18, intercept:40
- **Actor** :52
  constructor:53, place:65, sync:66, move:68
- **Team** :107
  constructor:108, setFormation:118, spot:125, avoid:136, laneClear:152, hasCover:164, update:174, updateGK:385

## src/match/view.js (142 рядків)

MatchView: 3D-сцена матчу: 22 гравці, стадіон, м'яч, тіні, час доби й погода.

- **MatchView** :22
  constructor:23, look:77, setEnv:81, setup:111, updateShadows:127

## src/match/walkout.js (197 рядків)

Walkout: декорації виходу команд: прапори, килим, салют.

- Внутрішні функції: flagTexture:17, clubFlagTexture:33, setFlag:41, bearer:76
- **Cloth** :44
  constructor:45, shape:51
- **PoleFlag** :59
  constructor:60, update:68
- **Walkout** :88
  constructor:89, start:108, hide:124, wave:127, update:138, fireworks:190

## src/online/codec.js (86 рядків)

Кадр онлайн-матчу: готові пози всіх 22 гравців (19 суглобів, як у повторі), м'яч, камера кат-сцен і стан гри.

- Експорти: NODES:5, EXPR:6, PER:8, BALL:9, PHASES:11, F:13, captureRef:16, encode:26, decode:57

## src/online/flag.js (358 рядків)

Прапор онлайн-клубу: шари «поле → оздоба → плашка і знак → рамка», малювання в SVG і на canvas з одних шляхів,

- Експорти: FLAG_PATS:80, FLAG_EMB:138, FLAG_PLATES:151, FLAG_OVS:174, FLAG_EDGES:176, flagSvg:212, flagUri:214, drawFlag:216, emblemSvg:227, FLAG_COLS:234, contrast:241, FLAG_STYLES:286, rollColors:295, rollFlag:315, normFlag:340, upgradeFlag:351
- Внутрішні функції: shapes:181, fitEmblem:302

## src/online/guest.js (342 рядків)

Гість онлайн-матчу: показує гру господаря й керує своєю командою.

- **GuestMatch** :25
  constructor:26, start:40, onRef:62, onFrame:66, onEvent:85, renderT:88, applyEvent:90, update:136, blend:166, header:188, camInfo:231, camOverride:240, celebView:241, isPlaying:242, pause:243, resume:244, startPens:245, skipCine:246, canAim:249, pointerDown:250, joyStart:259, joyMove:265, pointerMove:266, pointerUp:267, cancelAim:277, hideAim:278, sendAim:279, updateAim:282, exit:331

## src/online/host.js (99 рядків)

Господар онлайн-матчу: його гра — єдина правда. Він рахує фізику, ІІ і правила для обох команд, а гостю шле:

- **HostLink** :12
  constructor:13, install:19, uninstall:29, sendRef:31, resync:33, hud:39, ev:48, onMsg:51, frame:72

## src/online/names.js (64 рядків)

Імена героїв онлайн-клубу: українське ім'я + прізвище, зібране за справжніми зразками (суфікси, козацькі складені,

- Експорти: FIRST_NAMES:7, newName:52, SURNAME_POOLS:64

## src/online/net.js (179 рядків)

Мережа онлайн-матчу: кімната за кодом через PeerJS (публічний сервер лише знайомить двох гравців), далі — пряме

- Експорти: PROTO:9, makeCode:10, cleanCode:11
- Внутрішні функції: loadPeer:25, openPeer:27
- **Net** :38
  constructor:39, on:44, emit:45, kept:48, watch:54, host:62, join:84, attach:100, setupStream:117, onMsg:128, startPing:135, send:147, sendFrame:149, lost:154, rejoin:162, close:169

## src/online/profile.js (205 рядків)

Онлайн-клуб гравця: окремий від кар'єри «Локомотива» — своя назва, прапор, форма, 11 унікальних героїв, рівень,

- Експорти: esc:15, TRAITS:23, RARITY:36, ONLINE_FORMS:45, slotsOf:46, ONLINE_AIM:49, ONLINE_GK:50, newHero:54, newClub:69, OP:92, saveOP:93, resetOP:94, kitOf:99, gkKitOf:103, shortOf:104, heroOvr:108, teamRating:109, trainPrice:110, SCOUT_PRICE:111, clubXpNeed:112, trainHero:114, setForm:121, swapHeroes:126, scoutHero:132, toWire:141, plain:152, fromWire:156, matchClub:178, applyResult:185
- Внутрішні функції: migrate:79, load:86

## src/online/screen.js (354 рядків)

Вкладка «Онлайн» у меню: свій онлайн-клуб (назва, прапор, рівень, рейтинг), герої з прокачкою і гра з людиною

- **OnlineScreen** :29
  constructor:30, onMenu:57, subKey:65, playState:66, html:68, clubCard:85, kitsHtml:93, clubHtml:97, feHtml:117, dice:118, thumb:119, feGen:120, feField:128, feEmblem:133, feColors:151, feExtra:158, rollCands:164, remember:165, patchFlag:167, patchFe:174, flagDone:184, syncSoon:187, look:190, afterRender:191, heroDetail:192, heroesHtml:204, revealHero:206, playHtml:215, input:253, setColor:274, act:275, copy:324, showResult:330

## src/online/session.js (231 рядків)

Онлайн-сесія: кімната за кодом → лобі (обидва бачать клуби одне одного й тиснуть «Готовий») → матч → результат

- **Online** :15
  constructor:16, role:21, inMatch:22, refresh:23, setErr:24, create:27, join:34, why:41, bind:50, hello:74, sync:76, onMsg:78, setReady:104, buildSpec:113, me:123, startMatch:125, beginGuest:137, finish:150, guestEnd:162, leave:170, stopMatch:181, oppLeft:188, dropped:201, rematch:212, toLobby:216, close:222

## src/physics/aim.js (123 рядків)

AimPath (симуляція пунктиру прицілу з відскоками) і AimDots (його малювання).

- **AimPath** :10
  constructor:11, setCircles:20, simulate:27
- **AimDots** :79
  constructor:80, hide:90, draw:93

## src/physics/ballmodel.js (127 рядків)

Єдина модель польоту м'яча (stepFree) і BallPlan (прогноз для ШІ); опис фізики нижче.

- Експорти: BALL:21, stepFree:39, ground:80
- **BallPlan** :87
  constructor:88, build:94, at:109, cross:116

## src/physics/world.js (281 рядків)

World: фізика м'яча з кроком 120 Гц: борти, штанги, сітка, безперервні зіткнення з тілами.

- Експорти: sweepCircle:14, sweepCapsule:30, makeBody:279
- Внутрішні функції: bounce:48
- **World** :60
  constructor:61, seg:69, buildStatic:71, integrate:85, wallHit:185, players:195, net:246, goalSide:269

## src/state/economy.js (69 рядків)

Економіка кар'єри: ціна стадіону, дохід, каса, поточні нападник і воротар, випускник академії.

- Експорти: stadiumCost:11, INCOME_STEP:13, academyBonus:22, incomePct:23, incomeMult:24, stadiumTier:26, nextTierLevel:31, striker:36, keeper:37, keeperTier:38, CASH_CAP_MIN:41, cashRate:42, pendingCash:43, rollGraduate:48, fmt:64

## src/state/rivals.js (83 рядків)

Суперники кар'єри: стиль клубу, реванш, скаутинг гри гравця; опис нижче.

- Експорти: hashStr:14, STYLES:17, rivalOf:27, evolveSpec:38, recordMatch:61, scoutNote:77
- Внутрішні функції: scoutKnow:55

## src/state/save.js (100 рядків)

Збереження кар'єри: об'єкт S у localStorage, commit/flush, підписники. Нове поле додавай у defaults().

- Експорти: S:70, subscribe:75, onSaveError:78, flush:80, commit:87, resetAll:92
- Внутрішні функції: merge:30, normalize:43, load:53

## src/state/squad.js (250 рядків)

Склад: реальний ROSTER, навички, рівні, заміни, тренування, склади суперників (oppSquad).

- Експорти: STAT_KEYS:9, GK_KEYS:10, STAT_NAMES:11, STAT_HINT:12, keysFor:16, ROLE_UA:17, myKit:35, makeStats:38, ovr:43, xpNeed:48, trainCost:49, tierOf:50, newEntry:56, ROSTER:70, groupOf:83, defaultSquad:97, ensureSquad:105, allPlayers:119, swapTargets:122, swapPlayers:128, CAREER_FORMS:140, setTactic:146, swapStarters:148, bestLine:153, oppSquad:165, skillOf:185, gkBonus:192, squadLook:197, lookSig:204, gainXp:207, trainStat:223, signGraduate:232, squadRating:250
- Внутрішні функції: rosterEntry:85, relabelSquad:142

## src/style.css (1748 рядків)

Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.

- Розділи: Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.:1 · кнопки:30 · сплеш:44 · панелі:56 · джойстик і мобільна зручність:103 · символіка клубу:129 · склад, картка гравця:143 · оверлеї:182 · результат:201 · HUD:219 · поверни пристрій:267 · анімації:272 · емблема-картинка заповнює свій контейнер:295 · інтро: нічна станція, паровоз, світлофор «стоп → вперед», печатка клубу:303 · потяг УЗ: заїжджає, зупиняється біля платформи, дає зелений і відправляється:367 · денний краєвид як у «404-потязі»: пагорби й хмари пливуть, колія біжить, потяг пружинить:387 · їде без зупинок: заїзд, хід, плавний розгін уперед:407 · потяг із прикладу Uiverse (rohit_4476), один в один:412 · розвернутий локомотив у клубних кольорах + 3 вагони:426 · потяг стоїть колесами на рейці: тінь, головка рейки, баласт:448 · світлофор керується потягом; фінал стартує за сигналом; чант:461 · поки їде потяг: стрічка фактів і логотипів клубу:485 · редактор вигляду:495 · серія пенальті:512 · адаптація вікон під низькі екрани (телефон у ландшафті): вміст прокручується, кнопка «закрити» завжди на місці:531 · табло як на телебаченні: компактна плашка зліва вгорі:554 · анімації табло:571 · картка гравця з м'ячем: компактніша:590 · підказка для iPhone: встановити на початковий екран:599 · головна: ЛОКО РАШ — швидкість, залізниця, лівреї УЗ:604 · назва: косі літери, «розріз» швидкості, шлейф:611 · кнопка:625 · діагональні смуги лівреї УЗ праворуч:635 · колія внизу: рейки, що біжать, і вогні поїзда:644 · налаштування джойстика: рядок не накладається на «На весь екран»:659 · верхній ряд:686 · маршрут ліги:696 · гаманець:717 · бічні: табличка клубу і табло:730 · низ: прокачка, вкладки, «ВПЕРЕД!»:792 · прокачка стадіону — кремова коса табличка:795 · вкладки — косі плитки лівреї, активна червона з кремовою рискою:813 · «ВПЕРЕД!» — та сама коса кнопка, що й на заставці, тільки більша:821 · поява меню:847 · вузькі екрани (4:3, 16:10) і низькі телефони:883 · текст не вилазить за межі блоків:897 · картки в панелях: нічого не стискається поверх сусіда, а що не влізло — гортається всередині картки:901 · джойстик: плавна поява, у катсценах прихований:928 · пауза:943 · налаштування:985 · табличка доданого часу — як LED-табло резервного судді:1112 · смужка автора гола під табло:1121 · велике табло рахунку: перерви й фінальний свисток:1135 · годинник: хвилина перекидається, секунди біжать рівно, смужка тайму; до розведення годинник стоїть (блимає двокрапка):1175 · онлайн: п'ята вкладка меню, онлайн-клуб, кімната за кодом:1193 · смуга зверху в кольорах клубу й косий штрих на тлі:1209 · вхідні анімації вмісту: лише при новій сторінці:1236 · кнопки в ліврею:1245 · полотно, що майорить:1256 · сцена під прапором: промені в кольорах клубу:1267 · лобі:1340 · клуб і редактор прапора:1365 · герої: тактичне поле, гравець на весь зріст, навички:1445 · низький екран (телефон лежачи): панель займає весь екран, меню за нею ховається:1528 · палець: більші цілі, без залиплого наведення, легші анімації:1539 · сяйво й промені за заголовком:1586 · конфеті:1595 · заголовок: літери падають згори з перельотом, потім по ньому пробігає відблиск:1608 · табло: два герби на косих плитах, рахунок «грюкає»:1625 · автори голів — під своєю командою:1647 · каса праворуч: плита з рейками-смугами, рядки виїжджають, суми дораховуються:1661 · кнопки — як у паузі:1688 · повторне малювання того самого вікна: вхідні анімації не повторюються:1708 · мінімапа матчу (ui/minimap.js):1711

## src/ui/hud.js (208 рядків)

Hud: табло матчу, годинник, картка гравця, банери. Методи з HUD_FWD (online/host.js) віддзеркалюються гостю.

- **Hud** :7
  constructor:8, show:48, hide:64, setScore:67, setTime:79, setProg:98, addedTime:105, scored:112, scoreCard:120, setSignal:140, setCoins:145, bump:149, warn:151, hint:157, combo:162, banner:168, goal:174, clearGoal:180, cine:182, setCard:192, float:202

## src/ui/icons.js (34 рядків)

Прості вбудовані SVG-іконки: без емодзі та зовнішніх файлів.

- Експорти: I:4, crest:26, lokoCrest:32

## src/ui/intro.js (223 рядків)

playIntro: заставка запуску: станція, потяг, світлофор (DOM/CSS).

- Експорти: playIntro:120
- Внутрішні функції: say:7

## src/ui/minimap-demo.js (214 рядків)

DemoMatch: маленька гра для зразка мінімапи в налаштуваннях: розстановки, пресинг, паси, удари, сейви, голи й аути. На справжній матч не впливає.

- **DemoMatch** :14
  constructor:15, lineUp:29, start:33, give:37, formation:40, press:54, stepPlayers:65, nearest:75, choosePass:83, pass:97, shoot:106, stepBall:113, goal:144, dead:149, step:154

## src/ui/minimap.js (466 рядків)

Мінімапа матчу: Minimap малює поле, гравців, напрямок бігу й траєкторію м'яча; MapHud ставить її на екран і веде режим перетягування.

- **Minimap** :48
  constructor:49, attach:62, setKits:64, resize:71, sx:81, sy:82, bake:84, reset:113, read:116, demo:135, sample:138, tick:161, draw:172, drawView:186, drawRuns:197, drawBallPath:212, drawTeam:240, nearBall:252, drawBall:258
- **MapHud** :272
  constructor:273, apply:293, setKits:305, applyAlpha:311, layout:317, compute:327, planHtml:346, refreshPlan:362, animatePlan:368, placeJoyZone:376, update:386, ballCheck:400, bindPreview:409, place:417, resetPlace:418, setEdit:420, syncBar:426, initDrag:431

## src/ui/portrait.js (115 рядків)

portrait: рендерить 3D-модель гравця один раз у PNG для карток.

- Експорти: portrait:22, mountTurntable:108
- Внутрішні функції: init:10, viewerInit:55, viewerRelease:73, viewerLook:77, viewerTick:89

## src/ui/tactics.js (107 рядків)

Tactics: екран складу для кар'єри й онлайн-клубу. Вибір схеми, поле з фішками, запас, обмін місцями, гравець на весь зріст.

- Експорти: formName:8
- **Tactics** :17
  constructor:18, pos:19, token:23, formsHtml:27, popHtml:29, swapHtml:33, ttSig:38, ttHtml:39, html:43, afterRender:61, fill:68, patch:77, act:94

## src/ui/ui.js (890 рядків)

UI: меню, панелі, пауза, налаштування, результат, джойстик. Кнопки: data-act -> UI.act.

- Внутрішні функції: countTo:26, redraw:47
- **UI** :53
  constructor:54, onResize:161, key:171, isIOS:193, isStandalone:194, iosHint:195, useJoy:203, setMatchUi:207, applyControls:208, initJoy:228, act:276, menuTap:339, toast:347, setSlow:352, flash:353, showMenu:359, tiltNav:370, rollFlaps:382, hideMenu:399, leagueStrip:401, refresh:416, menuCards:433, clock:473, tickCash:478, claimCash:486, deny:494, pop:495, buyStadium:497, openPanel:508, panelCovers:517, closePanel:518, renderPanel:523, statBar:539, teamSheet:542, careerLook:554, careerDetail:555, squadHtml:568, train:587, transfersHtml:595, academyHtml:612, stadiumHtml:627, chronicleHtml:645, symbolsHtml:655, buy:666, equip:675, collectGraduate:681, boostAcademy:699, openCustom:709, closeCustom:712, customAct:713, renderCustom:730, openSettings:753, closeSettings:756, renderSettings:757, pause:797, showResult:811, renderResult:840, hideResult:889

## src/ui/vox.js (82 рядків)

Воксельні іконки в ізометрії: ті самі кубики, з яких складена гра, лише в SVG.

- Експорти: VOX:48
- Внутрішні функції: shade:7, vox:13
