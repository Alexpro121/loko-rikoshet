# Карта коду

Згенеровано `npm run docs:map`, руками не правити. Запис `назва:рядок` веде до оголошення в цьому файлі.
Рядки зсуваються з кожною правкою: якщо карта застаріла, перегенеруй її або шукай за назвою.

## src/club.js (61 рядків)

Ідентичність ФК «Локомотив» Київ: історія, символіка, факти. Джерела: Вікіпедія (FC Lokomotyv Kyiv),

- Експорти: CLUB:4, CHRONICLE:15, FACTS:31, LEGENDS:43, ALUMNI:44, HONOURS:46, STADIUM:51, randomFact:61

## src/config.js (196 рядків)

Усі числові константи гри в одному місці.

- Експорти: PITCH:3, PHYS:20, COL:35, KIT_LOKO:42, KITS:44, KIT_GK_LOKO:49, KIT_CLASH:52, kitDist:55, pickKit:60, LEAGUES:74, STAT_KEYS:88, GK_KEYS:89, LINE_OF:90, FORMATIONS:95, FIXTURES:105, matchSpec:111, STRIKERS:134, shotSkill:144, KEEPERS:146, ACADEMY:154, STADIUM_TIERS:174, STADIUM_TIER_NAMES:175, SETTINGS_DEFAULT:177, CAM_PRESETS:189

## src/core/audio.js (207 рядків)

Увесь звук синтезується на льоту (WebAudio): жодних файлів, нуль завантаження.

- Експорти: audio:202, vibrate:204
- **AudioEngine** :5
  constructor:6, unlock:18, applySettings:42, suspend:49, resume:51, live:56, tone:59, hiss:72, kick:86, wall:90, coin:98, pass:103, save:104, whistle:105, horn:115, goal:128, concede:133, bell:137, rumble:141, click:142, back:143, buy:144, deny:145, win:146, lose:147, slowmo:149, beat:153, slide:154, clap:155, thud:156, startCrowd:158, crowd:166, music:172, schedule:181

## src/core/camera.js (312 рядків)

CamDirector: ігрова камера матчу за пресетами CAM_PRESETS (config.js); кадрує м'яч і важливих гравців.

- Експорти: camPreset:19, pathPoint:26, camInfoBlank:36
- **CamDirector** :50
  constructor:51, snap:65, add:67, nearest:70, collect:85, need:122, needOne:131, solve:137, bounds:152, update:174, keepIn:298

## src/core/game.js (532 рядків)

Game: рендерер, сцена меню, стейт-машина MENU/MATCH/GOAL/RESULT, головний цикл, ввід, камера матчу, якість.

- Експорти: gfxFail:27
- Внутрішні функції: springStep:21
- **Game** :37
  constructor:38, cineFlat:87, ensureMatch:99, warmShaders:106, buildStates:119, play:159, toMenu:163, quitMatch:164, onStadiumUpgraded:166, resize:171, basePixelRatio:182, applyPixelRatio:191, resMin:202, fixedLevel:205, setLevel:207, qualityChanged:214, levelDown:224, governor:239, onGlLost:282, onGlRestored:289, onVisibility:295, updateMenuCam:302, computeMatchBase:316, snapCamera:317, addTrauma:319, fovKick:321, updateMatchCam:323, autoFocus:379, screenToGround:395, worldToScreen:406, acquireWake:413, floatWorld:422, bindInput:429, isFullscreen:475, enterFullscreen:476, toggleFullscreen:484, tick:491, onFrameError:499, step:508

## src/core/perf.js (39 рядків)

Рівні деталізації під пристрій: що спрощувати, коли роздільність уже не рятує, перша оцінка телефона, пам'ять між запусками.

- Експорти: DETAIL:9, MAX_LEVEL:15, loadPerf:28, savePerf:37
- Внутрішні функції: guess:18

## src/core/stateMachine.js (17 рядків)

Мінімальна стейт-машина: MENU / MATCH / GOAL / RESULT.

- **StateMachine** :2
  constructor:3, add:5, go:7, update:16

## src/core/telegram.js (236 рядків)

Telegram Mini App: SDK лише всередині Telegram, повний екран, поворот, кнопка «назад», вібрація, запрошення, хмарна копія збереження.

- Експорти: inTelegram:22, appHidden:24, initTelegram:32, tgReady:69, tgFullscreen:72, tgEnterFullscreen:73, tgToggleFullscreen:74, tgHaptic:108, tgStartRoom:119, tgShareRoom:128, bindTelegram:137, splitChunks:178, pullCloud:192, pushCloud:217
- Внутрішні функції: launchedInTelegram:26, setup:49, lockLandscape:81, rotateHelp:87, sigOf:168

## src/graphics/ball.js (88 рядків)

BallView: видимий м'яч (меш, обертання); стан м'яча живе у physics/world.js.

- Внутрішні функції: ballGeometry:10
- **BallView** :38
  constructor:39, squash:56, update:65

## src/graphics/cinefx.js (102 рядків)

CineFX: постобробка кат-сцен (кінофокус) через EffectComposer; game.js має запасний звичайний рендер.

- **CineFX** :51
  constructor:52, verify:71, resize:82, render:84

## src/graphics/gait.js (583 рядків)

Gait: процедурна хода гравця (стопи в світі, ритм, рівновага); викликається з Player.animate.

- Експорти: HUMAN:46
- Внутрішні функції: osc:56
- **Gait** :67
  constructor:69, reset:87, update:107, step:127, hip:516, liftOff:522, touchDown:530, footGap:542, landPsi:548, phaseAngle:554, liftOf:557, legIK:560, measure:572

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

## src/graphics/player.js (2876 рядків)

Player: воксельна модель гравця, усі анімації (Player.animate), IK рук і ніг, пози воротаря.

- Експорти: angDiff:21, GK_STRIKE:60, diveKin:145
- Внутрішні функції: capQ:50, spring:89, oscS:105, accent:119, jumpPhase:120, atlasMat:164, printMat:174, rigidMats:188, hairBlock:321, headGeo:383, bodyGeo:405
- **RigidSkeleton** :202
  update:203
- **Player** :439
  constructor:441, setLook:517, useSkin:541, skinGeo:555, setExpr:580, setMode:595, kick:600, volley:609, backLeg:614, dropPose:627, cheer:629, react:641, sad:648, reach:662, engage:664, solveReach:670, poleIK:704, bodyGuard:727, impulse:782, jolt:786, gesture:792, tapBall:801, feint:809, ballHint:811, faceNow:813, control:818, receive:824, chest:830, header:832, block:833, hit:834, emote:839, beaten:844, tackle:852, stumble:859, downed:864, stagger:869, knock:878, dropRag:892, slideTackle:899, kneel:900, rest:902, bakeSlide:904, hug:906, gkDive:908, gkSmother:916, diveReset:918, setAim:919, startPDive:926, planDive:940, startPKick:975, jumpC:977, gkJump:979, saveSide:981, gkPunch:989, gkTip:991, gkFoot:993, gkShin:998, gkStar:1005, parry:1010, ballAt:1020, perceive:1034, catchBall:1052, catchMk:1059, gkKnee:1065, gkFall:1067, throwBall:1068, setThreat:1069, fendAt:1071, hipTurn:1080, jostle:1107, rise:1110, animate:1140, groundGuard:2284, diveTakeoff:2306, armGuard:2334, hitbox:2410, handsIK:2443, kickIK:2681, shinIK:2717, shinLat:2744, tackleIK:2750, reachFoot:2762, plantFeet:2790, solveArms:2852

## src/graphics/ragdoll.js (427 рядків)

Ragdoll: падіння гравця як система точок Верле; вмикається з Player.knock.

- Експорти: ragPoints:40, arcBlend:363
- Внутрішні функції: ptsOf:48, blendQ:353, basisQ:376, hingeQ:390, legQ:422
- **Ragdoll** :52
  constructor:63, com:94, setDrive:102, frame:118, step:126, limitKnees:218, minDist:232, limitLegs:244, legLim:261, limitBody:274, closest:283, segSep:294, nudge:311, faceDown:314, apply:322

## src/graphics/stands.js (559 рядків)

Stands: трибуни й глядачі (анімація в шейдерах), реакції натовпу на гру, банери, прапори, сектор гостей.

- Внутрішні функції: drawAtlas:14, bannerAtlas:29, bannerMat:89, pin:98, crowdMat:212
- **Stands** :234
  constructor:235, buildBanners:350, addCloth:369, buildFlags:375, buildAway:399, setOpponent:417, setHome:439, react:463, cheer:471, chantEnv:474, setDetail:480, update:490, track:528, runFlashes:547

## src/graphics/surround.js (129 рядків)

buildSurround: усе поза трибунами матчу: земля, оточення, поїзд у кольорах Локо.

- Експорти: buildSurround:51
- Внутрішні функції: canvasTex:12, facadeTexture:20, windowsTexture:40

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

## src/graphics/weather.js (49 рядків)

Weather: дощ і сніг на InstancedMesh.

- **Weather** :9
  constructor:10, setDensity:24, set:29, update:34

## src/lab/lab.css (34 рядків)

Стилі сторінки лабораторії (lab.html).

- Розділи: Стилі сторінки лабораторії (lab.html).:1

## src/lab/lab.js (548 рядків)

Лабораторія гравця (lab.html): окрема сторінка для перевірки моделі, ходи й анімацій; window.lab у консолі.

- Внутрішні функції: spawn:89, setWire:109, setJoints:118, start:132, divePrep:169, gkShot:179, stepBall:203, steer:237, tick:265, resize:349, setCam:365, renderCams:375, btn:383, row:384, select:385, range:390, swatches:395, check:400, renderPanel:406, test:465, actions:512

## src/main.js (38 рядків)

Точка входу основної гри: шрифти, склад, UI, Game, онлайн-екран, сервіс-воркер.

- Внутрішні функції: boot:14

## src/match/brain.js (429 рядків)

TeamBrain: командне мислення ШІ. Читання гри, лінії блоку, опіка без дублів, ролі без м'яча, сигнал рукою; оцінки удару, паса й ведення.

- Експорти: JOB:9, laneDist:33, zoneValue:53, shotQuality:63, passRisk:83, pickCarry:100
- Внутрішні функції: add:27, nearest:46
- **TeamBrain** :122
  constructor:123, reset:125, read:132, setLines:161, defSpot:182, gaps:189, assignRest:205, countJobs:220, assignMarks:227, defPace:256, updateCalls:269, hand:300, afterPass:314, pickJob:319, place:381

## src/match/cinema.js (214 рядків)

Кат-сценні інструменти: Replay (запис і повтор поз), Slaps («дай п'ять»), рукостискання.

- Експорти: shakeHands:106, patShoulder:116, missReact:195
- **Replay** :16
  constructor:17, clear:28, idx:29, t0:30, t1:31, rec:33, write:39, blend:48, apply:71, cut:81, applyClip:90, saveLive:97, restoreLive:98
- **Slaps** :133
  constructor:134, busy:135, of:136, add:138, clear:145, update:146, move:162

## src/match/dribble.js (61 рядків)

- Експорти: keepBallIn:19, dribbleStep:39
- Внутрішні функції: offWall:8

## src/match/match.js (3123 рядків)

Match: уся логіка матчу: фази, ввід удару, м'яч, відбори, воротарі, голи, кат-сцени, нагороди. Огляд: docs/ARCHITECTURE.md.

- **Match** :49
  constructor:50, start:92, formation:152, kickFor:194, timeText:197, periodBound:203, gameMin:204, overMin:206, extraText:207, minuteLabel:213, stoppage:219, ballFlying:224, calmBall:226, whistlePeriod:234, setClockHud:235, halfText:241, gkWaitBlock:249, pointerDown:251, joyStart:266, joyMove:274, pointerMove:276, pointerUp:278, hideAim:292, cancelAim:293, kickErr:299, shotMul:300, updateAim:302, cutAimAtMates:370, onWall:386, onPost:397, onBody:408, saveStep:474, catchLimit:480, legDeflect:487, creditSave:497, saveReact:503, controlScore:521, claimBall:544, tackleChance:564, addXp:566, showCard:569, bump:579, startTackle:591, updateTackles:607, resolveTackle:628, hasBall:661, looseBall:664, placeBallAt:679, trapMine:687, makeReady:703, trapOpp:718, clearReceivers:738, laneClear:741, passAim:747, choosePass:758, longTarget:791, passTo:808, recheckPass:824, kickYaw:839, carries:845, carry:852, kickApproach:877, kickReady:895, dribbleKick:905, kickFollow:919, doPass:932, launchFor:949, startShot:958, aimCounter:975, counterPath:981, takerThink:993, updateTaker:1026, matesTackle:1142, releaseCounter:1155, remoteCtl:1170, gkHoldNow:1172, remoteWaiting:1173, remoteAimPose:1176, remoteHold:1183, remoteKick:1198, remoteRelease:1208, pickOppReceiver:1225, ricochetGoal:1247, pickMyReceiver:1253, launchShot:1274, onGoal:1296, updateGoal:1345, afterGoal:1358, pendingPause:1366, update:1369, nextPeriod:1415, timeOver:1426, procLead:1442, procAt:1454, driveIntro:1469, laneStep:1558, postStep:1590, skipIntroPart:1624, crowdBox:1640, detour:1652, steerAround:1675, introSeparate:1695, setGaze:1713, endIntro:1714, introCam:1728, clearCine:1768, startPens:1779, camInfo:1787, camOverride:1798, markMoment:1812, storeClip:1818, takeMoments:1826, startHighlights:1830, playClips:1836, nextClip:1841, updateClip:1852, endClips:1865, replayCam:1871, skipCine:1882, startBreak:1891, updateBreak:1903, endBreak:1923, breakCam:1928, assignEndRoles:1943, endShake:1986, endCam:2020, clearSlow:2043, updateSlow:2046, checkTackles:2070, oppLunging:2085, lungePause:2088, tacklePatience:2091, tackleReady:2097, updateDanger:2107, tick:2119, resolvePlayers:2228, updateSlides:2283, startSlide:2326, onSlideContact:2336, keeperCollect:2360, facesBall:2381, inGloves:2395, gkReceive:2415, gkRush:2428, startSmother:2444, resolveSmother:2455, updateKeepers:2468, goalImportance:2619, setupCelebration:2640, celebView:2660, fanBurst:2676, updateCelebration:2682, fallbackPick:2798, updateHolder:2816, keeperBodies:2849, updateSolidity:2870, animatePlayers:2882, syncView:2907, netBulge:2968, floatAt:2984, pause:2987, resume:2988, isPlaying:2989, endCelebrate:2992, endTalk:3029, end:3052, exit:3113

## src/match/penalty.js (457 рядків)

Penalties: серія пенальті: своя панель, приціл, стрибок воротаря, 3D-політ м'яча.

- **Penalties** :22
  constructor:23, start:25, build:45, dots:83, keeperMove:93, camOverride:106, setMark:114, placeMark:123, begin:132, decide:157, fire:175, announce:192, verdict:204, update:219, liveStep:228, ballStep:320, judge:417, endKick:430, dispose:442, unbindKeys:443, post:446, finish:448

## src/match/team.js (527 рядків)

Actor (гравець у логіці) і Team (рух ШІ: хто на м'яч, виконання рішень TeamBrain, воротар).

- Внутрішні функції: ballAt:19, intercept:42
- **Actor** :61
  constructor:62, place:74, sync:75, move:77
- **Team** :116
  constructor:117, setFormation:128, spot:135, avoid:146, laneClear:162, hasCover:174, update:184, updateGK:420

## src/match/view.js (161 рядків)

MatchView: 3D-сцена матчу: 22 гравці, стадіон, м'яч, тіні, час доби й погода.

- **MatchView** :23
  constructor:24, look:79, setEnv:82, setDetail:113, fitFog:116, swapSpots:122, setup:130, updateShadows:146

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

## src/online/screen.js (378 рядків)

Вкладка «Онлайн» у меню: свій онлайн-клуб (назва, прапор, рівень, рейтинг), герої з прокачкою і гра з людиною

- **OnlineScreen** :30
  constructor:31, onMenu:58, subKey:66, playState:67, html:69, clubCard:86, clubTiles:92, kitsHtml:97, clubHtml:101, feHtml:121, dice:122, thumb:123, feGen:124, feField:132, feEmblem:137, feColors:155, feExtra:162, rollCands:168, remember:169, patchFlag:171, patchFe:178, flagDone:188, syncSoon:191, look:194, afterRender:195, heroDetail:196, heroesHtml:208, revealHero:210, playHtml:219, stampOf:256, oppCard:258, patchOpp:263, input:275, setColor:296, act:297, copy:348, showResult:354

## src/online/session.js (284 рядків)

Онлайн-сесія: кімната за кодом → лобі (обидва бачать клуби одне одного й тиснуть «Готовий») → матч → результат

- **Online** :21
  constructor:22, role:33, inMatch:34, sendVis:35, onVis:37, busy:49, unready:51, refresh:52, setErr:53, create:56, join:63, why:70, bind:80, hello:104, sync:106, onMsg:108, setReady:151, buildSpec:160, me:171, startMatch:173, beginGuest:187, finish:201, guestEnd:213, leave:221, techLoss:231, stopMatch:237, oppLeft:244, dropped:257, rematch:263, toLobby:267, close:275

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

## src/physics/world.js (313 рядків)

World: фізика м'яча з кроком 120 Гц: борти, штанги, сітка, безперервні зіткнення з тілами.

- Експорти: sweepCircle:16, sweepCapsule:32, makeBody:311
- Внутрішні функції: bounce:50
- **World** :62
  constructor:63, seg:71, buildStatic:73, integrate:88, wallHit:214, players:224, net:276, goalSide:301

## src/state/economy.js (76 рядків)

Економіка кар'єри: ціна стадіону, дохід, каса, поточні нападник і воротар, випускник академії.

- Експорти: stadiumCost:11, INCOME_STEP:13, academyBonus:22, incomePct:23, incomeMult:24, stadiumTier:26, nextTierLevel:31, striker:36, keeper:37, keeperTier:38, CASH_CAP_MIN:41, cashRate:42, pendingCash:44, keepCash:49, rollGraduate:55, fmt:71

## src/state/rivals.js (86 рядків)

Суперники кар'єри: стиль клубу, реванш, скаутинг гри гравця; опис нижче.

- Експорти: hashStr:14, STYLES:17, rivalOf:27, evolveSpec:38, recordMatch:64, scoutNote:80
- Внутрішні функції: scoutKnow:55

## src/state/save.js (155 рядків)

Збереження кар'єри: об'єкт S у localStorage, commit/flush, підписники. Нове поле додавай у defaults().

- Експорти: S:121, subscribe:126, onSaveError:129, holdSave:132, flush:134, commit:142, resetAll:147
- Внутрішні функції: merge:31, cleanPlayer:52, cleanSquad:64, normalize:78, load:102

## src/state/squad.js (264 рядків)

Склад: реальний ROSTER, навички, рівні, заміни, тренування, склади суперників (oppSquad).

- Експорти: STAT_NAMES:10, STAT_HINT:11, keysFor:15, ROLE_UA:16, myKit:34, matchKit:36, makeStats:39, ovr:44, xpNeed:49, trainCost:50, tierOf:51, newEntry:57, ROSTER:71, defaultSquad:94, ensureSquad:102, allPlayers:116, swapPlayers:119, CAREER_FORMS:131, setTactic:137, swapStarters:139, bestLine:144, oppSquad:156, skillOf:183, gkBonus:190, squadLook:197, lookSig:204, customizeLook:207, resetLook:214, gainXp:221, trainStat:237, signGraduate:246, squadRating:264
- Внутрішні функції: rosterEntry:82, relabelSquad:133

## src/style.css (1769 рядків)

Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.

- Розділи: Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.:1 · кнопки:35 · сплеш:49 · панелі:61 · джойстик і мобільна зручність:108 · символіка клубу:137 · склад, картка гравця:151 · оверлеї:190 · результат:209 · HUD:227 · поверни пристрій:275 · анімації:284 · емблема-картинка заповнює свій контейнер:307 · інтро: нічна станція, паровоз, світлофор «стоп → вперед», печатка клубу:315 · потяг УЗ: заїжджає, зупиняється біля платформи, дає зелений і відправляється:379 · денний краєвид як у «404-потязі»: пагорби й хмари пливуть, колія біжить, потяг пружинить:399 · їде без зупинок: заїзд, хід, плавний розгін уперед:419 · потяг із прикладу Uiverse (rohit_4476), один в один:424 · розвернутий локомотив у клубних кольорах + 3 вагони:438 · потяг стоїть колесами на рейці: тінь, головка рейки, баласт:460 · світлофор керується потягом; фінал стартує за сигналом; чант:473 · поки їде потяг: стрічка фактів і логотипів клубу:497 · редактор вигляду:507 · серія пенальті:524 · адаптація вікон під низькі екрани (телефон у ландшафті): вміст прокручується, кнопка «закрити» завжди на місці:543 · табло як на телебаченні: компактна плашка зліва вгорі:566 · анімації табло:583 · картка гравця з м'ячем: компактніша:602 · підказка для iPhone: встановити на початковий екран:611 · головна: ЛОКО РАШ — швидкість, залізниця, лівреї УЗ:616 · назва: косі літери, «розріз» швидкості, шлейф:623 · кнопка:637 · діагональні смуги лівреї УЗ праворуч:647 · колія внизу: рейки, що біжать, і вогні поїзда:656 · налаштування джойстика: рядок не накладається на «На весь екран»:671 · верхній ряд:698 · маршрут ліги:708 · гаманець:729 · бічні: табличка клубу і табло:742 · низ: прокачка, вкладки, «ВПЕРЕД!»:804 · прокачка стадіону — кремова коса табличка:807 · вкладки — косі плитки лівреї, активна червона з кремовою рискою:825 · «ВПЕРЕД!» — та сама коса кнопка, що й на заставці, тільки більша:833 · поява меню:859 · вузькі екрани (4:3, 16:10) і низькі телефони:895 · текст не вилазить за межі блоків:909 · картки в панелях: нічого не стискається поверх сусіда, а що не влізло — гортається всередині картки:913 · джойстик: плавна поява, у катсценах прихований:940 · пауза:955 · налаштування:997 · низьке або вузьке вікно: Налаштування на всю висоту, а якщо вкладки однаково не вміщаються, вони прокручуються:1041 · табличка доданого часу — як LED-табло резервного судді:1131 · смужка автора гола під табло:1140 · велике табло рахунку: перерви й фінальний свисток:1154 · годинник: хвилина перекидається, секунди біжать рівно, смужка тайму; до розведення годинник стоїть (блимає двокрапка):1194 · онлайн: п'ята вкладка меню, онлайн-клуб, кімната за кодом:1212 · смуга зверху в кольорах клубу й косий штрих на тлі:1228 · вхідні анімації вмісту: лише при новій сторінці:1255 · кнопки в ліврею:1264 · полотно, що майорить:1275 · сцена під прапором: промені в кольорах клубу:1286 · лобі:1359 · клуб і редактор прапора:1384 · герої: тактичне поле, гравець на весь зріст, навички:1464 · низький екран (телефон лежачи): панель займає весь екран, меню за нею ховається:1548 · палець: більші цілі, без залиплого наведення, легші анімації:1559 · сяйво й промені за заголовком:1606 · конфеті:1615 · заголовок: літери падають згори з перельотом, потім по ньому пробігає відблиск:1628 · табло: два герби на косих плитах, рахунок «грюкає»:1645 · автори голів — під своєю командою:1667 · каса праворуч: плита з рейками-смугами, рядки виїжджають, суми дораховуються:1681 · кнопки — як у паузі:1708 · повторне малювання того самого вікна: вхідні анімації не повторюються:1728 · мінімапа матчу (ui/minimap.js):1731

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

## src/ui/ui.js (963 рядків)

UI: меню, панелі, пауза, налаштування, результат, джойстик. Кнопки: data-act -> UI.act.

- Внутрішні функції: countTo:27, redraw:48
- **UI** :54
  constructor:55, onResize:163, key:174, goBack:190, canGoBack:199, isIOS:204, isStandalone:205, iosHint:206, useJoy:214, setMatchUi:218, applyControls:219, joyCenter:238, placeJoy:243, initJoy:248, act:296, kitNote:360, setJoyEdit:366, editDone:372, menuTap:378, toast:387, setSlow:392, flash:393, showMenu:399, tiltNav:410, rollFlaps:422, hideMenu:439, leagueStrip:446, refresh:461, menuCards:478, fitFlaps:519, clock:528, tickCash:533, claimCash:541, deny:549, pop:550, buyStadium:552, openPanel:563, panelCovers:572, closePanel:573, renderPanel:581, showTier:599, statBar:605, teamSheet:608, careerLook:620, careerDetail:621, squadHtml:634, train:653, transfersHtml:661, academyHtml:678, stadiumHtml:693, chronicleHtml:711, symbolsHtml:721, buy:732, equip:741, collectGraduate:747, boostAcademy:767, openCustom:777, closeCustom:780, customAct:781, renderCustom:798, openSettings:821, closeSettings:824, renderSettings:825, pause:868, showResult:884, renderResult:913, hideResult:962

## src/ui/vox.js (82 рядків)

Воксельні іконки в ізометрії: ті самі кубики, з яких складена гра, лише в SVG.

- Експорти: VOX:48
- Внутрішні функції: shade:7, vox:13
