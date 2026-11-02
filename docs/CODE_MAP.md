# Карта коду

Згенеровано `npm run docs:map`, руками не правити. Запис `назва:рядок` веде до оголошення в цьому файлі.
Рядки зсуваються з кожною правкою: якщо карта застаріла, перегенеруй її або шукай за назвою.

## src/club.js (61 рядків)

Ідентичність ФК «Локомотив» Київ: історія, символіка, факти. Джерела: Вікіпедія (FC Lokomotyv Kyiv),

- Експорти: CLUB:4, CHRONICLE:15, FACTS:31, LEGENDS:43, ALUMNI:44, HONOURS:46, STADIUM:51, randomFact:61

## src/config.js (196 рядків)

Усі числові константи гри в одному місці.

- Експорти: PITCH:3, PHYS:20, COL:35, KIT_LOKO:42, KITS:44, KIT_GK_LOKO:49, KIT_CLASH:52, kitDist:55, pickKit:60, LEAGUES:74, STAT_KEYS:88, GK_KEYS:89, LINE_OF:90, FORMATIONS:95, FIXTURES:105, matchSpec:111, STRIKERS:134, shotSkill:144, KEEPERS:146, ACADEMY:154, STADIUM_TIERS:174, STADIUM_TIER_NAMES:175, SETTINGS_DEFAULT:177, CAM_PRESETS:189

## src/core/audio.js (205 рядків)

Увесь звук синтезується на льоту (WebAudio): жодних файлів, нуль завантаження.

- Експорти: audio:201, vibrate:203
- **AudioEngine** :4
  constructor:5, unlock:17, applySettings:41, suspend:48, resume:50, live:55, tone:58, hiss:71, kick:85, wall:89, coin:97, pass:102, save:103, whistle:104, horn:114, goal:127, concede:132, bell:136, rumble:140, click:141, back:142, buy:143, deny:144, win:145, lose:146, slowmo:148, beat:152, slide:153, clap:154, thud:155, startCrowd:157, crowd:165, music:171, schedule:180

## src/core/camera.js (312 рядків)

CamDirector: ігрова камера матчу за пресетами CAM_PRESETS (config.js); кадрує м'яч і важливих гравців.

- Експорти: camPreset:19, pathPoint:26, camInfoBlank:36
- **CamDirector** :50
  constructor:51, snap:65, add:67, nearest:70, collect:85, need:122, needOne:131, solve:137, bounds:152, update:174, keepIn:298

## src/core/game.js (477 рядків)

Game: рендерер, сцена меню, стейт-машина MENU/MATCH/GOAL/RESULT, головний цикл, ввід, камера матчу, якість.

- Експорти: gfxFail:25
- Внутрішні функції: springStep:19
- **Game** :35
  constructor:36, cineFlat:82, ensureMatch:94, warmShaders:101, buildStates:114, play:154, toMenu:158, quitMatch:159, onStadiumUpgraded:161, resize:166, basePixelRatio:177, applyPixelRatio:186, governor:197, onGlLost:231, onGlRestored:238, onVisibility:244, updateMenuCam:251, computeMatchBase:265, snapCamera:266, addTrauma:268, fovKick:270, updateMatchCam:272, autoFocus:328, screenToGround:344, worldToScreen:355, acquireWake:362, floatWorld:371, bindInput:378, isFullscreen:424, enterFullscreen:425, toggleFullscreen:432, tick:438, onFrameError:446, step:455

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

## src/graphics/gait.js (575 рядків)

Gait: процедурна хода гравця (стопи в світі, ритм, рівновага); викликається з Player.animate.

- Експорти: HUMAN:42
- Внутрішні функції: osc:52
- **Gait** :63
  constructor:65, reset:83, update:103, step:122, hip:508, liftOff:514, touchDown:522, footGap:534, landPsi:540, phaseAngle:546, liftOf:549, legIK:552, measure:564

## src/graphics/island.js (486 рядків)

Island: острів у меню: стадіон за ярусами прокачки, потяг, кубки, небо.

- Внутрішні функції: stand:13, buildLoop:36
- **Island** :51
  constructor:52, buildBase:67, buildTrack:120, buildStadium:135, buildTrophy:306, setTrophies:334, buildSky:342, buildTrain:369, trackAt:376, setTier:387, dust:403, celebrate:411, placeCar:416, update:418

## src/graphics/logo.js (9 рядків)

Справжня емблема клубу (public/loko-logo.svg), завантажується один раз і ділиться між текстурами.

- Експорти: logoReady:7, logoImg:8, whenLogo:9

## src/graphics/particles.js (91 рядків)

Particles: пул частинок без алокацій (голи, удари, конфеті).

- **Particles** :12
  constructor:13, emit:32, burst:44, update:52, clear:90

## src/graphics/pitch.js (197 рядків)

buildPitch: газон, розмітка, борти, ворота й сітки матчу; OUTLINE — контур арени.

- Експорти: OUTLINE:13, buildPitch:35
- Внутрішні функції: lineSeg:15, insetPolygon:20

## src/graphics/player.js (2730 рядків)

Player: воксельна модель гравця, усі анімації (Player.animate), IK рук і ніг, пози воротаря.

- Експорти: angDiff:21, GK_STRIKE:60, diveKin:144
- Внутрішні функції: capQ:50, spring:88, oscS:104, accent:118, jumpPhase:119, atlasMat:163, printMat:173, hairBlock:288, headGeo:350, bodyGeo:372
- **Player** :406
  constructor:408, setLook:484, setExpr:503, setMode:513, kick:518, volley:527, backLeg:532, dropPose:545, cheer:547, react:559, sad:566, reach:580, engage:582, solveReach:588, poleIK:622, bodyGuard:645, impulse:700, jolt:704, gesture:710, tapBall:719, feint:727, ballHint:729, faceNow:731, control:736, receive:742, chest:748, header:750, block:751, hit:752, emote:757, beaten:762, tackle:770, stumble:777, downed:782, stagger:787, knock:796, dropRag:810, slideTackle:817, kneel:818, rest:820, bakeSlide:822, hug:824, gkDive:826, gkSmother:834, diveReset:836, setAim:837, startPDive:844, planDive:858, startPKick:893, jumpC:895, gkJump:897, saveSide:899, gkPunch:907, gkTip:909, gkFoot:911, gkStar:913, parry:918, ballAt:928, perceive:942, catchBall:960, catchMk:967, gkKnee:973, gkFall:975, throwBall:976, setThreat:977, fendAt:979, hipTurn:988, jostle:1015, rise:1018, animate:1048, groundGuard:2171, diveTakeoff:2193, armGuard:2221, hitbox:2297, handsIK:2330, kickIK:2568, tackleIK:2604, reachFoot:2616, plantFeet:2644, solveArms:2706

## src/graphics/ragdoll.js (427 рядків)

Ragdoll: падіння гравця як система точок Верле; вмикається з Player.knock.

- Експорти: ragPoints:40, arcBlend:363
- Внутрішні функції: ptsOf:48, blendQ:353, basisQ:376, hingeQ:390, legQ:422
- **Ragdoll** :52
  constructor:63, com:94, setDrive:102, frame:118, step:126, limitKnees:218, minDist:232, limitLegs:244, legLim:261, limitBody:274, closest:283, segSep:294, nudge:311, faceDown:314, apply:322

## src/graphics/stands.js (371 рядків)

Stands: трибуни й глядачі на InstancedMesh, реакції натовпу, банери, прапори, сектор гостей.

- Внутрішні функції: drawAtlas:14, bannerAtlas:29, waveMat:43
- **Stands** :59
  constructor:60, buildBanners:161, buildFlags:184, buildAway:204, setOpponent:223, setHome:246, react:265, cheer:270, chantEnv:273, writeMatrices:279, update:321, runFlashes:359

## src/graphics/surround.js (123 рядків)

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

## src/lab/lab.js (546 рядків)

Лабораторія гравця (lab.html): окрема сторінка для перевірки моделі, ходи й анімацій; window.lab у консолі.

- Внутрішні функції: spawn:89, setWire:108, setJoints:117, start:131, divePrep:168, gkShot:178, stepBall:201, steer:235, tick:263, resize:347, setCam:363, renderCams:373, btn:381, row:382, select:383, range:388, swatches:393, check:398, renderPanel:404, test:463, actions:510

## src/main.js (32 рядків)

Точка входу основної гри: шрифти, склад, UI, Game, онлайн-екран, сервіс-воркер.

- Внутрішні функції: boot:12

## src/match/brain.js (406 рядків)

TeamBrain: командне мислення ШІ. Читання гри, лінії блоку, опіка без дублів, ролі без м'яча, сигнал рукою; оцінки удару, паса й ведення.

- Експорти: JOB:8, laneDist:29, zoneValue:48, shotQuality:58, passRisk:78, pickCarry:95
- Внутрішні функції: add:26, nearest:41
- **TeamBrain** :116
  constructor:117, reset:119, read:126, setLines:154, defSpot:172, gaps:179, assignRest:195, countJobs:210, assignMarks:217, updateCalls:246, hand:277, afterPass:291, pickJob:296, place:358

## src/match/cinema.js (213 рядків)

Кат-сценні інструменти: Replay (запис і повтор поз), Slaps («дай п'ять»), рукостискання.

- Експорти: shakeHands:106, patShoulder:116, missReact:195
- **Replay** :16
  constructor:17, clear:28, idx:29, t0:30, t1:31, rec:33, write:39, blend:48, apply:71, cut:81, applyClip:90, saveLive:97, restoreLive:98
- **Slaps** :133
  constructor:134, busy:135, of:136, add:138, clear:145, update:146, move:162

## src/match/dribble.js (61 рядків)

- Експорти: keepBallIn:19, dribbleStep:39
- Внутрішні функції: offWall:8

## src/match/match.js (3016 рядків)

Match: уся логіка матчу: фази, ввід удару, м'яч, відбори, воротарі, голи, кат-сцени, нагороди. Огляд: docs/ARCHITECTURE.md.

- **Match** :49
  constructor:50, start:92, formation:152, kickFor:194, timeText:197, periodBound:203, gameMin:204, overMin:206, extraText:207, minuteLabel:213, stoppage:219, ballFlying:224, calmBall:226, whistlePeriod:234, setClockHud:235, halfText:241, gkWaitBlock:249, pointerDown:251, joyStart:266, joyMove:274, pointerMove:276, pointerUp:278, hideAim:292, cancelAim:293, kickErr:299, shotMul:300, updateAim:302, cutAimAtMates:370, onWall:386, onPost:397, onBody:408, creditSave:472, saveReact:478, controlScore:495, claimBall:518, tackleChance:538, addXp:540, showCard:543, bump:553, startTackle:565, updateTackles:581, resolveTackle:601, hasBall:634, looseBall:637, placeBallAt:652, trapMine:660, makeReady:675, trapOpp:690, clearReceivers:708, laneClear:711, choosePass:727, longTarget:757, passTo:774, kickYaw:787, carries:793, carry:800, kickApproach:825, kickReady:843, dribbleKick:853, kickFollow:867, doPass:880, launchFor:898, startShot:907, aimCounter:924, counterPath:930, takerThink:942, updateTaker:969, matesTackle:1074, releaseCounter:1086, remoteCtl:1101, gkHoldNow:1103, remoteWaiting:1104, remoteAimPose:1107, remoteHold:1114, remoteKick:1129, remoteRelease:1139, pickOppReceiver:1156, ricochetGoal:1178, pickMyReceiver:1184, launchShot:1205, onGoal:1227, updateGoal:1276, afterGoal:1289, pendingPause:1297, update:1300, nextPeriod:1346, timeOver:1357, procLead:1373, procAt:1385, driveIntro:1400, laneStep:1489, postStep:1521, skipIntroPart:1555, crowdBox:1571, detour:1583, steerAround:1606, introSeparate:1626, setGaze:1644, endIntro:1645, introCam:1659, clearCine:1699, startPens:1710, camInfo:1718, camOverride:1729, markMoment:1743, storeClip:1749, takeMoments:1757, startHighlights:1761, playClips:1767, nextClip:1772, updateClip:1783, endClips:1796, replayCam:1802, skipCine:1813, startBreak:1822, updateBreak:1834, endBreak:1854, breakCam:1859, assignEndRoles:1874, endShake:1917, endCam:1951, clearSlow:1974, updateSlow:1977, checkTackles:2001, oppLunging:2014, tackleReady:2017, updateDanger:2025, tick:2037, resolvePlayers:2146, updateSlides:2201, startSlide:2242, onSlideContact:2252, keeperCollect:2276, facesBall:2297, inGloves:2311, gkReceive:2331, gkRush:2344, startSmother:2360, resolveSmother:2371, updateKeepers:2384, goalImportance:2528, setupCelebration:2549, celebView:2569, fanBurst:2585, updateCelebration:2591, fallbackPick:2707, updateHolder:2724, keeperBodies:2757, updateSolidity:2777, animatePlayers:2789, syncView:2802, netBulge:2861, floatAt:2877, pause:2880, resume:2881, isPlaying:2882, endCelebrate:2885, endTalk:2922, end:2945, exit:3006

## src/match/penalty.js (457 рядків)

Penalties: серія пенальті: своя панель, приціл, стрибок воротаря, 3D-політ м'яча.

- **Penalties** :22
  constructor:23, start:25, build:45, dots:83, keeperMove:93, camOverride:106, setMark:114, placeMark:123, begin:132, decide:157, fire:175, announce:192, verdict:204, update:219, liveStep:228, ballStep:320, judge:417, endKick:430, dispose:442, unbindKeys:443, post:446, finish:448

## src/match/team.js (492 рядків)

Actor (гравець у логіці) і Team (рух ШІ: хто на м'яч, виконання рішень TeamBrain, воротар).

- Внутрішні функції: ballAt:19, intercept:41
- **Actor** :53
  constructor:54, place:66, sync:67, move:69
- **Team** :108
  constructor:109, setFormation:120, spot:127, avoid:138, laneClear:154, hasCover:166, update:176, updateGK:387

## src/match/view.js (157 рядків)

MatchView: 3D-сцена матчу: 22 гравці, стадіон, м'яч, тіні, час доби й погода.

- **MatchView** :23
  constructor:24, look:78, setEnv:81, fitFog:112, swapSpots:118, setup:126, updateShadows:142

## src/match/walkout.js (211 рядків)

Walkout: декорації виходу команд: прапори, килим, салют.

- Внутрішні функції: flagTexture:19, lokoFlagTexture:35, clubFlagTexture:47, setFlag:55, bearer:90
- **Cloth** :58
  constructor:59, shape:65
- **PoleFlag** :73
  constructor:74, update:82
- **Walkout** :102
  constructor:103, start:122, hide:138, wave:141, update:152, fireworks:204

## src/online/codec.js (86 рядків)

Кадр онлайн-матчу: готові пози всіх 22 гравців (19 суглобів, як у повторі), м'яч, камера кат-сцен і стан гри.

- Експорти: NODES:5, EXPR:6, PER:8, BALL:9, PHASES:11, F:13, captureRef:16, encode:26, decode:57

## src/online/flag.js (358 рядків)

Прапор онлайн-клубу: шари «поле → оздоба → плашка і знак → рамка», малювання в SVG і на canvas з одних шляхів,

- Експорти: FLAG_PATS:80, FLAG_EMB:138, FLAG_PLATES:151, FLAG_OVS:174, FLAG_EDGES:176, flagSvg:212, flagUri:214, drawFlag:216, emblemSvg:227, FLAG_COLS:234, contrast:241, FLAG_STYLES:286, rollColors:295, rollFlag:315, normFlag:340, upgradeFlag:351
- Внутрішні функції: shapes:181, fitEmblem:302

## src/online/guest.js (406 рядків)

Гість онлайн-матчу: показує гру господаря й керує своєю командою.

- **GuestMatch** :28
  constructor:29, start:44, onRef:67, onFrame:72, onEvent:98, renderT:101, applyEvent:104, update:164, blend:204, header:226, camInfo:273, camOverride:282, celebView:283, isPlaying:285, pause:286, resume:287, startPens:288, skipCine:289, canAim:292, pointerDown:293, joyStart:303, joyMove:310, pointerMove:311, pointerUp:312, cancelAim:322, hideAim:323, sendAim:324, updateAim:327, cutAimAtMates:380, exit:395

## src/online/host.js (115 рядків)

Господар онлайн-матчу: його гра — єдина правда. Він рахує фізику, ШІ і правила для обох команд, а гостю шле:

- **HostLink** :13
  constructor:14, install:21, uninstall:34, sendRef:36, resync:38, hud:44, ev:53, newPoss:56, timedOut:58, wake:60, onMsg:63, frame:86

## src/online/names.js (64 рядків)

Імена героїв онлайн-клубу: українське ім'я + прізвище, зібране за справжніми зразками (суфікси, козацькі складені,

- Експорти: FIRST_NAMES:7, newName:52, SURNAME_POOLS:64

## src/online/net.js (198 рядків)

Мережа онлайн-матчу: кімната за кодом через PeerJS (публічний сервер лише знайомить двох гравців), далі — пряме

- Експорти: PROTO:12, makeCode:13, cleanCode:14
- Внутрішні функції: tabToken:29, loadPeer:35, openPeer:40
- **Net** :51
  constructor:52, on:57, emit:58, kept:61, watch:67, host:75, join:97, attach:113, setupStream:130, onMsg:141, startPing:148, send:160, sendFrame:162, drop:168, offline:171, lost:173, rejoin:181, close:188

## src/online/profile.js (269 рядків)

Онлайн-клуб гравця: окремий від кар'єри «Локомотива» — своя назва, прапор, форма, 11 унікальних героїв, рівень,

- Експорти: esc:15, TRAITS:23, RARITY:36, ONLINE_FORMS:45, slotsOf:46, ONLINE_AIM:49, ONLINE_GK:50, newHero:54, newClub:69, OP:142, saveOP:143, markLive:145, clearLive:146, settleLive:147, resetOP:148, kitOf:154, awayKit:161, gkKitOf:167, shortOf:168, heroOvr:172, teamRating:173, trainPrice:174, SCOUT_PRICE:175, clubXpNeed:176, trainHero:178, setForm:185, swapHeroes:190, scoutHero:196, toWire:205, plain:216, fromWire:220, matchClub:242, applyResult:249
- Внутрішні функції: repair:82, migrate:117, load:124

## src/online/screen.js (376 рядків)

Вкладка «Онлайн» у меню: свій онлайн-клуб (назва, прапор, рівень, рейтинг), герої з прокачкою і гра з людиною

- **OnlineScreen** :29
  constructor:30, onMenu:57, subKey:65, playState:66, html:68, clubCard:85, clubTiles:91, kitsHtml:96, clubHtml:100, feHtml:120, dice:121, thumb:122, feGen:123, feField:131, feEmblem:136, feColors:154, feExtra:161, rollCands:167, remember:168, patchFlag:170, patchFe:177, flagDone:187, syncSoon:190, look:193, afterRender:194, heroDetail:195, heroesHtml:207, revealHero:209, playHtml:218, stampOf:255, oppCard:257, patchOpp:262, input:274, setColor:295, act:296, copy:346, showResult:352

## src/online/session.js (283 рядків)

Онлайн-сесія: кімната за кодом → лобі (обидва бачать клуби одне одного й тиснуть «Готовий») → матч → результат

- **Online** :20
  constructor:21, role:32, inMatch:33, sendVis:34, onVis:36, busy:48, unready:50, refresh:51, setErr:52, create:55, join:62, why:69, bind:79, hello:103, sync:105, onMsg:107, setReady:150, buildSpec:159, me:170, startMatch:172, beginGuest:186, finish:200, guestEnd:212, leave:220, techLoss:230, stopMatch:236, oppLeft:243, dropped:256, rematch:262, toLobby:266, close:274

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

## src/physics/world.js (297 рядків)

World: фізика м'яча з кроком 120 Гц: борти, штанги, сітка, безперервні зіткнення з тілами.

- Експорти: sweepCircle:16, sweepCapsule:32, makeBody:295
- Внутрішні функції: bounce:50
- **World** :62
  constructor:63, seg:71, buildStatic:73, integrate:88, wallHit:198, players:208, net:260, goalSide:285

## src/state/economy.js (76 рядків)

Економіка кар'єри: ціна стадіону, дохід, каса, поточні нападник і воротар, випускник академії.

- Експорти: stadiumCost:11, INCOME_STEP:13, academyBonus:22, incomePct:23, incomeMult:24, stadiumTier:26, nextTierLevel:31, striker:36, keeper:37, keeperTier:38, CASH_CAP_MIN:41, cashRate:42, pendingCash:44, keepCash:49, rollGraduate:55, fmt:71

## src/state/rivals.js (86 рядків)

Суперники кар'єри: стиль клубу, реванш, скаутинг гри гравця; опис нижче.

- Експорти: hashStr:14, STYLES:17, rivalOf:27, evolveSpec:38, recordMatch:64, scoutNote:80
- Внутрішні функції: scoutKnow:55

## src/state/save.js (150 рядків)

Збереження кар'єри: об'єкт S у localStorage, commit/flush, підписники. Нове поле додавай у defaults().

- Експорти: S:120, subscribe:125, onSaveError:128, flush:130, commit:137, resetAll:142
- Внутрішні функції: merge:30, cleanPlayer:51, cleanSquad:63, normalize:77, load:101

## src/state/squad.js (264 рядків)

Склад: реальний ROSTER, навички, рівні, заміни, тренування, склади суперників (oppSquad).

- Експорти: STAT_NAMES:10, STAT_HINT:11, keysFor:15, ROLE_UA:16, myKit:34, matchKit:36, makeStats:39, ovr:44, xpNeed:49, trainCost:50, tierOf:51, newEntry:57, ROSTER:71, defaultSquad:94, ensureSquad:102, allPlayers:116, swapPlayers:119, CAREER_FORMS:131, setTactic:137, swapStarters:139, bestLine:144, oppSquad:156, skillOf:183, gkBonus:190, squadLook:197, lookSig:204, customizeLook:207, resetLook:214, gainXp:221, trainStat:237, signGraduate:246, squadRating:264
- Внутрішні функції: rosterEntry:82, relabelSquad:133

## src/style.css (1760 рядків)

Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.

- Розділи: Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.:1 · кнопки:30 · сплеш:44 · панелі:56 · джойстик і мобільна зручність:103 · символіка клубу:132 · склад, картка гравця:146 · оверлеї:185 · результат:204 · HUD:222 · поверни пристрій:270 · анімації:275 · емблема-картинка заповнює свій контейнер:298 · інтро: нічна станція, паровоз, світлофор «стоп → вперед», печатка клубу:306 · потяг УЗ: заїжджає, зупиняється біля платформи, дає зелений і відправляється:370 · денний краєвид як у «404-потязі»: пагорби й хмари пливуть, колія біжить, потяг пружинить:390 · їде без зупинок: заїзд, хід, плавний розгін уперед:410 · потяг із прикладу Uiverse (rohit_4476), один в один:415 · розвернутий локомотив у клубних кольорах + 3 вагони:429 · потяг стоїть колесами на рейці: тінь, головка рейки, баласт:451 · світлофор керується потягом; фінал стартує за сигналом; чант:464 · поки їде потяг: стрічка фактів і логотипів клубу:488 · редактор вигляду:498 · серія пенальті:515 · адаптація вікон під низькі екрани (телефон у ландшафті): вміст прокручується, кнопка «закрити» завжди на місці:534 · табло як на телебаченні: компактна плашка зліва вгорі:557 · анімації табло:574 · картка гравця з м'ячем: компактніша:593 · підказка для iPhone: встановити на початковий екран:602 · головна: ЛОКО РАШ — швидкість, залізниця, лівреї УЗ:607 · назва: косі літери, «розріз» швидкості, шлейф:614 · кнопка:628 · діагональні смуги лівреї УЗ праворуч:638 · колія внизу: рейки, що біжать, і вогні поїзда:647 · налаштування джойстика: рядок не накладається на «На весь екран»:662 · верхній ряд:689 · маршрут ліги:699 · гаманець:720 · бічні: табличка клубу і табло:733 · низ: прокачка, вкладки, «ВПЕРЕД!»:795 · прокачка стадіону — кремова коса табличка:798 · вкладки — косі плитки лівреї, активна червона з кремовою рискою:816 · «ВПЕРЕД!» — та сама коса кнопка, що й на заставці, тільки більша:824 · поява меню:850 · вузькі екрани (4:3, 16:10) і низькі телефони:886 · текст не вилазить за межі блоків:900 · картки в панелях: нічого не стискається поверх сусіда, а що не влізло — гортається всередині картки:904 · джойстик: плавна поява, у катсценах прихований:931 · пауза:946 · налаштування:988 · низьке або вузьке вікно: Налаштування на всю висоту, а якщо вкладки однаково не вміщаються, вони прокручуються:1032 · табличка доданого часу — як LED-табло резервного судді:1122 · смужка автора гола під табло:1131 · велике табло рахунку: перерви й фінальний свисток:1145 · годинник: хвилина перекидається, секунди біжать рівно, смужка тайму; до розведення годинник стоїть (блимає двокрапка):1185 · онлайн: п'ята вкладка меню, онлайн-клуб, кімната за кодом:1203 · смуга зверху в кольорах клубу й косий штрих на тлі:1219 · вхідні анімації вмісту: лише при новій сторінці:1246 · кнопки в ліврею:1255 · полотно, що майорить:1266 · сцена під прапором: промені в кольорах клубу:1277 · лобі:1350 · клуб і редактор прапора:1375 · герої: тактичне поле, гравець на весь зріст, навички:1455 · низький екран (телефон лежачи): панель займає весь екран, меню за нею ховається:1539 · палець: більші цілі, без залиплого наведення, легші анімації:1550 · сяйво й промені за заголовком:1597 · конфеті:1606 · заголовок: літери падають згори з перельотом, потім по ньому пробігає відблиск:1619 · табло: два герби на косих плитах, рахунок «грюкає»:1636 · автори голів — під своєю командою:1658 · каса праворуч: плита з рейками-смугами, рядки виїжджають, суми дораховуються:1672 · кнопки — як у паузі:1699 · повторне малювання того самого вікна: вхідні анімації не повторюються:1719 · мінімапа матчу (ui/minimap.js):1722

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

## src/ui/minimap.js (482 рядків)

Мінімапа матчу: Minimap малює поле, гравців, напрямок бігу й траєкторію м'яча; MapHud ставить її на екран і веде режим перетягування.

- **Minimap** :49
  constructor:50, attach:63, setKits:65, resize:72, sx:82, sy:83, bake:85, reset:114, read:117, demo:136, sample:139, tick:162, draw:173, drawView:187, drawRuns:198, drawBallPath:213, drawTeam:241, nearBall:253, drawBall:259
- **MapHud** :273
  constructor:274, apply:294, setKits:306, applyAlpha:312, layout:318, compute:328, planHtml:357, refreshPlan:373, animatePlan:379, placeJoyZone:387, update:397, ballCheck:411, bindPreview:420, fitPreview:428, place:433, resetPlace:434, setEdit:436, syncBar:442, initDrag:447

## src/ui/portrait.js (115 рядків)

portrait: рендерить 3D-модель гравця один раз у PNG для карток.

- Експорти: portrait:22, mountTurntable:108
- Внутрішні функції: init:10, viewerInit:55, viewerRelease:73, viewerLook:77, viewerTick:89

## src/ui/tactics.js (110 рядків)

Tactics: екран складу для кар'єри й онлайн-клубу. Вибір схеми, поле з фішками, запас, обмін місцями, гравець на весь зріст.

- Експорти: formName:8
- **Tactics** :17
  constructor:18, reset:20, pos:21, token:26, formsHtml:30, popHtml:32, swapHtml:36, ttSig:41, ttHtml:42, html:46, afterRender:64, fill:71, patch:80, act:97

## src/ui/ui.js (955 рядків)

UI: меню, панелі, пауза, налаштування, результат, джойстик. Кнопки: data-act -> UI.act.

- Внутрішні функції: countTo:26, redraw:47
- **UI** :53
  constructor:54, onResize:162, key:173, isIOS:196, isStandalone:197, iosHint:198, useJoy:206, setMatchUi:210, applyControls:211, joyCenter:230, placeJoy:235, initJoy:240, act:288, kitNote:352, setJoyEdit:358, editDone:364, menuTap:370, toast:379, setSlow:384, flash:385, showMenu:391, tiltNav:402, rollFlaps:414, hideMenu:431, leagueStrip:438, refresh:453, menuCards:470, fitFlaps:511, clock:520, tickCash:525, claimCash:533, deny:541, pop:542, buyStadium:544, openPanel:555, panelCovers:564, closePanel:565, renderPanel:573, showTier:591, statBar:597, teamSheet:600, careerLook:612, careerDetail:613, squadHtml:626, train:645, transfersHtml:653, academyHtml:670, stadiumHtml:685, chronicleHtml:703, symbolsHtml:713, buy:724, equip:733, collectGraduate:739, boostAcademy:759, openCustom:769, closeCustom:772, customAct:773, renderCustom:790, openSettings:813, closeSettings:816, renderSettings:817, pause:860, showResult:876, renderResult:905, hideResult:954

## src/ui/vox.js (82 рядків)

Воксельні іконки в ізометрії: ті самі кубики, з яких складена гра, лише в SVG.

- Експорти: VOX:48
- Внутрішні функції: shade:7, vox:13
