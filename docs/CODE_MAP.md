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

## src/core/game.js (629 рядків)

Game: рендерер, сцена меню, стейт-машина MENU/MATCH/GOAL/RESULT, головний цикл, ввід, камера матчу, якість.

- Експорти: gfxFail:28
- Внутрішні функції: springStep:22
- **Game** :38
  constructor:39, cineFlat:88, ensureMatch:100, startSplash:103, splashView:119, updateSplash:125, splashBall:150, splashBallStep:167, splashRoar:186, stopSplash:188, warmShaders:201, buildStates:214, play:255, toMenu:259, quitMatch:260, onStadiumUpgraded:262, resize:267, basePixelRatio:278, applyPixelRatio:287, resMin:298, fixedLevel:301, setLevel:303, qualityChanged:310, levelDown:320, governor:335, onGlLost:378, onGlRestored:385, onVisibility:391, updateMenuCam:398, computeMatchBase:412, snapCamera:413, addTrauma:415, fovKick:417, updateMatchCam:419, autoFocus:475, screenToGround:491, worldToScreen:502, acquireWake:509, floatWorld:518, bindInput:525, isFullscreen:571, enterFullscreen:572, toggleFullscreen:580, tick:587, onFrameError:595, step:604

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

## src/graphics/stands.js (395 рядків)

Stands: трибуни й глядачі на InstancedMesh, реакції натовпу, банери, прапори, сектор гостей.

- Внутрішні функції: drawAtlas:14, bannerAtlas:29, waveMat:43
- **Stands** :59
  constructor:60, buildBanners:168, buildFlags:191, buildAway:211, setOpponent:230, setHome:253, react:272, cheer:277, chantEnv:280, writeMatrices:286, push:330, setDetail:337, update:345, runFlashes:383

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

## src/match/match.js (3122 рядків)

Match: уся логіка матчу: фази, ввід удару, м'яч, відбори, воротарі, голи, кат-сцени, нагороди. Огляд: docs/ARCHITECTURE.md.

- **Match** :49
  constructor:50, start:92, formation:152, kickFor:194, timeText:197, periodBound:203, gameMin:204, overMin:206, extraText:207, minuteLabel:213, stoppage:219, ballFlying:224, calmBall:226, whistlePeriod:234, setClockHud:235, halfText:241, gkWaitBlock:249, pointerDown:251, joyStart:266, joyMove:274, pointerMove:276, pointerUp:278, hideAim:292, cancelAim:293, kickErr:299, shotMul:300, updateAim:302, cutAimAtMates:370, onWall:386, onPost:397, onBody:408, saveStep:474, catchLimit:480, legDeflect:487, creditSave:497, saveReact:503, controlScore:520, claimBall:543, tackleChance:563, addXp:565, showCard:568, bump:578, startTackle:590, updateTackles:606, resolveTackle:627, hasBall:660, looseBall:663, placeBallAt:678, trapMine:686, makeReady:702, trapOpp:717, clearReceivers:737, laneClear:740, passAim:746, choosePass:757, longTarget:790, passTo:807, recheckPass:823, kickYaw:838, carries:844, carry:851, kickApproach:876, kickReady:894, dribbleKick:904, kickFollow:918, doPass:931, launchFor:948, startShot:957, aimCounter:974, counterPath:980, takerThink:992, updateTaker:1025, matesTackle:1141, releaseCounter:1154, remoteCtl:1169, gkHoldNow:1171, remoteWaiting:1172, remoteAimPose:1175, remoteHold:1182, remoteKick:1197, remoteRelease:1207, pickOppReceiver:1224, ricochetGoal:1246, pickMyReceiver:1252, launchShot:1273, onGoal:1295, updateGoal:1344, afterGoal:1357, pendingPause:1365, update:1368, nextPeriod:1414, timeOver:1425, procLead:1441, procAt:1453, driveIntro:1468, laneStep:1557, postStep:1589, skipIntroPart:1623, crowdBox:1639, detour:1651, steerAround:1674, introSeparate:1694, setGaze:1712, endIntro:1713, introCam:1727, clearCine:1767, startPens:1778, camInfo:1786, camOverride:1797, markMoment:1811, storeClip:1817, takeMoments:1825, startHighlights:1829, playClips:1835, nextClip:1840, updateClip:1851, endClips:1864, replayCam:1870, skipCine:1881, startBreak:1890, updateBreak:1902, endBreak:1922, breakCam:1927, assignEndRoles:1942, endShake:1985, endCam:2019, clearSlow:2042, updateSlow:2045, checkTackles:2069, oppLunging:2084, lungePause:2087, tacklePatience:2090, tackleReady:2096, updateDanger:2106, tick:2118, resolvePlayers:2227, updateSlides:2282, startSlide:2325, onSlideContact:2335, keeperCollect:2359, facesBall:2380, inGloves:2394, gkReceive:2414, gkRush:2427, startSmother:2443, resolveSmother:2454, updateKeepers:2467, goalImportance:2618, setupCelebration:2639, celebView:2659, fanBurst:2675, updateCelebration:2681, fallbackPick:2797, updateHolder:2815, keeperBodies:2848, updateSolidity:2869, animatePlayers:2881, syncView:2906, netBulge:2967, floatAt:2983, pause:2986, resume:2987, isPlaying:2988, endCelebrate:2991, endTalk:3028, end:3051, exit:3112

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

## src/match/view.js (160 рядків)

MatchView: 3D-сцена матчу: 22 гравці, стадіон, м'яч, тіні, час доби й погода.

- **MatchView** :23
  constructor:24, look:78, setEnv:81, setDetail:112, fitFog:115, swapSpots:121, setup:129, updateShadows:145

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

## src/style.css (1760 рядків)

Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.

- Розділи: Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.:1 · кнопки:35 · сплеш:49 · панелі:59 · джойстик і мобільна зручність:106 · символіка клубу:135 · склад, картка гравця:148 · оверлеї:187 · результат:206 · HUD:224 · поверни пристрій:272 · анімації:281 · емблема-картинка заповнює свій контейнер:304 · інтро: нічна станція, паровоз, світлофор «стоп → вперед», печатка клубу:312 · потяг УЗ: заїжджає, зупиняється біля платформи, дає зелений і відправляється:376 · денний краєвид як у «404-потязі»: пагорби й хмари пливуть, колія біжить, потяг пружинить:396 · їде без зупинок: заїзд, хід, плавний розгін уперед:416 · потяг із прикладу Uiverse (rohit_4476), один в один:421 · розвернутий локомотив у клубних кольорах + 3 вагони:435 · потяг стоїть колесами на рейці: тінь, головка рейки, баласт:457 · світлофор керується потягом; фінал стартує за сигналом; чант:470 · поки їде потяг: стрічка фактів і логотипів клубу:494 · редактор вигляду:504 · серія пенальті:521 · адаптація вікон під низькі екрани (телефон у ландшафті): вміст прокручується, кнопка «закрити» завжди на місці:540 · табло як на телебаченні: компактна плашка зліва вгорі:563 · анімації табло:580 · картка гравця з м'ячем: компактніша:599 · підказка для iPhone: встановити на початковий екран:608 · головна: ЛОКО РАШ. Власні літери й вхід у src/ui/splash.js; плоскі кольори, без градієнтів і світіння:613 · літери:619 · заслін: темне поле з отвором у літері O, летить на камеру й зникає:628 · кнопка: плоский блок із твердим об'ємом, як літери:640 · діагональні смуги лівреї на екрані результату й панелях:649 · підказка iPhone праворуч від назви:657 · налаштування джойстика: рядок не накладається на «На весь екран»:662 · верхній ряд:689 · маршрут ліги:699 · гаманець:720 · бічні: табличка клубу і табло:733 · низ: прокачка, вкладки, «ВПЕРЕД!»:795 · прокачка стадіону — кремова коса табличка:798 · вкладки — косі плитки лівреї, активна червона з кремовою рискою:816 · «ВПЕРЕД!» — та сама коса кнопка, що й на заставці, тільки більша:824 · поява меню:850 · вузькі екрани (4:3, 16:10) і низькі телефони:886 · текст не вилазить за межі блоків:900 · картки в панелях: нічого не стискається поверх сусіда, а що не влізло — гортається всередині картки:904 · джойстик: плавна поява, у катсценах прихований:931 · пауза:946 · налаштування:988 · низьке або вузьке вікно: Налаштування на всю висоту, а якщо вкладки однаково не вміщаються, вони прокручуються:1032 · табличка доданого часу — як LED-табло резервного судді:1122 · смужка автора гола під табло:1131 · велике табло рахунку: перерви й фінальний свисток:1145 · годинник: хвилина перекидається, секунди біжать рівно, смужка тайму; до розведення годинник стоїть (блимає двокрапка):1185 · онлайн: п'ята вкладка меню, онлайн-клуб, кімната за кодом:1203 · смуга зверху в кольорах клубу й косий штрих на тлі:1219 · вхідні анімації вмісту: лише при новій сторінці:1246 · кнопки в ліврею:1255 · полотно, що майорить:1266 · сцена під прапором: промені в кольорах клубу:1277 · лобі:1350 · клуб і редактор прапора:1375 · герої: тактичне поле, гравець на весь зріст, навички:1455 · низький екран (телефон лежачи): панель займає весь екран, меню за нею ховається:1539 · палець: більші цілі, без залиплого наведення, легші анімації:1550 · сяйво й промені за заголовком:1597 · конфеті:1606 · заголовок: літери падають згори з перельотом, потім по ньому пробігає відблиск:1619 · табло: два герби на косих плитах, рахунок «грюкає»:1636 · автори голів — під своєю командою:1658 · каса праворуч: плита з рейками-смугами, рядки виїжджають, суми дораховуються:1672 · кнопки — як у паузі:1699 · повторне малювання того самого вікна: вхідні анімації не повторюються:1719 · мінімапа матчу (ui/minimap.js):1722

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

## src/ui/splash.js (265 рядків)

Екран ЛОКО РАШ: власні блокові літери й вхід: м'яч відскакує по LOKO, ударом проходить крізь RUSH, ще один удар від глядача летить в отвір O, камера тримається за ним і пролітає крізь O, а там м'яч стає 3D і падає на поле стадіону.

- Експорти: splashHtml:29, runSplash:71
- **Trace** :40
  constructor:41, push:42, flight:44, squash:53, play:57

## src/ui/tactics.js (110 рядків)

Tactics: екран складу для кар'єри й онлайн-клубу. Вибір схеми, поле з фішками, запас, обмін місцями, гравець на весь зріст.

- Експорти: formName:8
- **Tactics** :17
  constructor:18, reset:20, pos:21, token:26, formsHtml:30, popHtml:32, swapHtml:36, ttSig:41, ttHtml:42, html:46, afterRender:64, fill:71, patch:80, act:97

## src/ui/ui.js (981 рядків)

UI: меню, панелі, пауза, налаштування, результат, джойстик. Кнопки: data-act -> UI.act.

- Внутрішні функції: countTo:28, redraw:49
- **UI** :55
  constructor:56, onResize:155, key:166, goBack:183, canGoBack:192, hideSplash:197, splashReady:206, isIOS:221, isStandalone:222, iosHint:223, useJoy:231, setMatchUi:235, applyControls:236, joyCenter:255, placeJoy:260, initJoy:265, act:313, kitNote:378, setJoyEdit:384, editDone:390, menuTap:396, toast:405, setSlow:410, flash:411, showMenu:417, tiltNav:428, rollFlaps:440, hideMenu:457, leagueStrip:464, refresh:479, menuCards:496, fitFlaps:537, clock:546, tickCash:551, claimCash:559, deny:567, pop:568, buyStadium:570, openPanel:581, panelCovers:590, closePanel:591, renderPanel:599, showTier:617, statBar:623, teamSheet:626, careerLook:638, careerDetail:639, squadHtml:652, train:671, transfersHtml:679, academyHtml:696, stadiumHtml:711, chronicleHtml:729, symbolsHtml:739, buy:750, equip:759, collectGraduate:765, boostAcademy:785, openCustom:795, closeCustom:798, customAct:799, renderCustom:816, openSettings:839, closeSettings:842, renderSettings:843, pause:886, showResult:902, renderResult:931, hideResult:980

## src/ui/vox.js (82 рядків)

Воксельні іконки в ізометрії: ті самі кубики, з яких складена гра, лише в SVG.

- Експорти: VOX:48
- Внутрішні функції: shade:7, vox:13
