# Карта коду

Згенеровано `npm run docs:map`, руками не правити. Запис `назва:рядок` веде до оголошення в цьому файлі.
Рядки зсуваються з кожною правкою: якщо карта застаріла, перегенеруй її або шукай за назвою.

## src/club.js (61 рядків)

Ідентичність ФК «Локомотив» Київ: історія, символіка, факти. Джерела: Вікіпедія (FC Lokomotyv Kyiv),

- Експорти: CLUB:4, CHRONICLE:15, FACTS:31, LEGENDS:43, ALUMNI:44, HONOURS:46, STADIUM:51, randomFact:61

## src/config.js (206 рядків)

Усі числові константи гри в одному місці.

- Експорти: PITCH:3, PHYS:20, COL:35, KIT_LOKO:42, KITS:44, KIT_GK_LOKO:49, KIT_CLASH:52, kitDist:55, pickKit:60, LEAGUES:74, STAT_KEYS:88, GK_KEYS:89, LINE_OF:90, FORMATIONS:95, FIXTURES:105, SEASON_HEAT:116, heatOf:117, matchSpec:120, STRIKERS:144, shotSkill:154, KEEPERS:156, ACADEMY:164, STADIUM_TIERS:184, STADIUM_TIER_NAMES:185, SETTINGS_DEFAULT:187, CAM_PRESETS:199

## src/core/audio-bank.js (153 рядків)

Банк семплів: справжні записи з src/audio (джерела й ліцензії в src/audio/SOURCES.md). Вантажаться у фоні після першого

- Експорти: LOOP_LEN:10, MARGIN:11, groupUrls:18, sealLoop:134
- Внутрішні функції: toMono:146, decode:153
- **Bank** :28
  constructor:29, has:43, count:44, load:47, loadAll:66, fetchBuf:75, prepare:86, take:96, swap:108, pick:120

## src/core/audio.js (645 рядків)

AudioEngine: гібрид. Натовп, удар, свисток, сітка, стовп, рукавиці це справжні записи (audio-bank.js), тонкі шари, інтерфейс

- Експорти: audio:640, vibrate:642
- **AudioEngine** :15
  constructor:16, rnd:42, jit:43, chance:44, clock:45, gate:47, unlock:49, attach:63, makeIR:120, applySettings:136, suspend:145, resume:147, live:152, claim:156, tone:164, hiss:178, mallet:193, sample:203, kick:227, pass:239, wall:247, post:257, net:269, save:278, thud:285, slide:291, clap:298, revPing:301, whistle:311, horn:326, goal:343, concede:352, crowdReact:361, win:379, lose:384, bell:389, rumble:391, click:394, back:395, coin:397, buy:402, deny:403, slowmo:406, beat:417, buildCrowd:425, crowd:431, lift:440, syncCrowd:442, aim:462, ensureLayer:468, startVoice:474, dropVoice:482, rotateBed:490, swapQuiet:502, isQuiet:509, tick:511, ensureSynth:519, stopTimer:527, stopLayers:531, slotReady:535, chant:537, track:543, music:561, schedule:577, playBar:584, padChord:599, endPad:615, key:617

## src/core/camera.js (312 рядків)

CamDirector: ігрова камера матчу за пресетами CAM_PRESETS (config.js); кадрує м'яч і важливих гравців.

- Експорти: camPreset:19, pathPoint:26, camInfoBlank:36
- **CamDirector** :50
  constructor:51, snap:65, add:67, nearest:70, collect:85, need:122, needOne:131, solve:137, bounds:152, update:174, keepIn:298

## src/core/game.js (635 рядків)

Game: рендерер, сцена меню, стейт-машина MENU/MATCH/GOAL/RESULT, головний цикл, ввід, камера матчу, якість.

- Експорти: gfxFail:28
- Внутрішні функції: springStep:22
- **Game** :38
  constructor:39, cineFlat:88, ensureMatch:100, startSplash:103, splashView:119, updateSplash:125, splashBall:150, splashBallStep:167, splashRoar:186, stopSplash:188, warmShaders:201, buildStates:214, play:255, toMenu:259, quitMatch:260, onStadiumUpgraded:262, resize:267, basePixelRatio:278, applyPixelRatio:287, resMin:298, fixedLevel:301, setLevel:303, qualityChanged:310, levelDown:320, governor:335, onGlLost:378, onGlRestored:385, onVisibility:391, updateMenuCam:398, computeMatchBase:412, snapCamera:413, addTrauma:415, fovKick:417, updateMatchCam:419, autoFocus:477, screenToGround:493, worldToScreen:504, acquireWake:511, floatWorld:520, bindInput:527, isFullscreen:573, enterFullscreen:574, toggleFullscreen:582, tick:589, onFrameError:597, step:606

## src/core/perf.js (39 рядків)

Рівні деталізації під пристрій: що спрощувати, коли роздільність уже не рятує, перша оцінка телефона, пам'ять між запусками.

- Експорти: DETAIL:9, MAX_LEVEL:15, loadPerf:28, savePerf:37
- Внутрішні функції: guess:18

## src/core/stateMachine.js (17 рядків)

Мінімальна стейт-машина: MENU / MATCH / GOAL / RESULT.

- **StateMachine** :2
  constructor:3, add:5, go:7, update:16

## src/core/telegram.js (244 рядків)

Telegram Mini App: SDK лише всередині Telegram, повний екран, поворот, кнопка «назад», вібрація, запрошення, хмарна копія збереження.

- Експорти: inTelegram:22, tgInitData:24, appHidden:26, initTelegram:34, tgReady:71, tgFullscreen:74, tgEnterFullscreen:75, tgToggleFullscreen:76, tgHaptic:110, tgStartRoom:121, tgShareMessage:130, tgShareRoom:136, bindTelegram:145, splitChunks:186, pullCloud:200, pushCloud:225
- Внутрішні функції: launchedInTelegram:28, setup:51, lockLandscape:83, rotateHelp:89, sigOf:176

## src/graphics/ball.js (88 рядків)

BallView: видимий м'яч (меш, обертання); стан м'яча живе у physics/world.js.

- Внутрішні функції: ballGeometry:10
- **BallView** :38
  constructor:39, squash:56, update:65

## src/graphics/boards.js (523 рядків)

LED-борти поля: кадри партнерів клубу, клубні й подієві кадри в атласі на роздільності справжнього LED; шейдер обирає кадр

- Експорти: BOARD_H:19, FRAME_LEN:20
- Внутрішні функції: trackW:35, track:37, fit:39, italic:41, lum:42, fgOn:44, chevron:45, drop:46, whenLogos:55, logo:66, goalTile:184
- **Boards** :301
  constructor:302, build:333, paintCell:345, paintAtlas:355, paintLive:359, frameDef:364, addSlot:367, setDetail:375, setTeams:382, redraw:390, begin:394, setB:395, go:396, waveDelay:401, pick:402, rotate:411, all:427, pair:433, cue:440, enter:468, resume:469, step:471, update:516

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

## src/graphics/pitch.js (201 рядків)

buildPitch: газон, розмітка, борти, ворота й сітки матчу; OUTLINE — контур арени.

- Експорти: OUTLINE:14, buildPitch:36
- Внутрішні функції: lineSeg:16, insetPolygon:21

## src/graphics/player.js (2881 рядків)

Player: воксельна модель гравця, усі анімації (Player.animate), IK рук і ніг, пози воротаря.

- Експорти: angDiff:21, GK_STRIKE:60, diveKin:146
- Внутрішні функції: capQ:50, spring:90, oscS:106, accent:120, jumpPhase:121, atlasMat:165, printMat:175, rigidMats:189, hairBlock:322, headGeo:384, bodyGeo:406
- **RigidSkeleton** :203
  update:204
- **Player** :440
  constructor:442, setLook:518, useSkin:542, skinGeo:556, setExpr:581, setMode:596, kick:601, volley:610, backLeg:615, dropPose:628, cheer:630, react:642, sad:649, reach:663, engage:665, solveReach:671, poleIK:705, bodyGuard:728, impulse:783, jolt:787, gesture:793, tapBall:802, feint:810, ballHint:812, faceNow:814, control:819, receive:825, chest:831, header:833, block:834, hit:835, emote:840, beaten:845, tackle:853, stumble:860, downed:865, stagger:870, knock:879, dropRag:893, slideTackle:900, kneel:901, rest:903, bakeSlide:905, hug:907, gkDive:909, gkSmother:917, diveReset:919, setAim:920, startPDive:927, planDive:941, startPKick:976, jumpC:978, gkJump:980, saveSide:982, gkPunch:990, gkTip:992, gkFoot:994, shinAim:996, gkShin:1001, gkStar:1007, parry:1012, ballAt:1022, perceive:1036, catchBall:1054, catchMk:1061, gkKnee:1067, gkFall:1069, throwBall:1070, setThreat:1071, fendAt:1073, hipTurn:1082, jostle:1109, rise:1112, animate:1142, groundGuard:2286, diveTakeoff:2308, armGuard:2336, hitbox:2412, handsIK:2445, kickIK:2683, shinIK:2721, shinLat:2749, tackleIK:2755, reachFoot:2767, plantFeet:2795, solveArms:2857

## src/graphics/ragdoll.js (427 рядків)

Ragdoll: падіння гравця як система точок Верле; вмикається з Player.knock.

- Експорти: ragPoints:40, arcBlend:363
- Внутрішні функції: ptsOf:48, blendQ:353, basisQ:376, hingeQ:390, legQ:422
- **Ragdoll** :52
  constructor:63, com:94, setDrive:102, frame:118, step:126, limitKnees:218, minDist:232, limitLegs:244, legLim:261, limitBody:274, closest:283, segSep:294, nudge:311, faceDown:314, apply:322

## src/graphics/stands.js (564 рядків)

Stands: трибуни й глядачі (анімація в шейдерах), реакції натовпу на гру, банери, прапори, сектор гостей.

- Внутрішні функції: drawAtlas:15, bannerAtlas:30, bannerMat:90, pin:99, crowdMat:213
- **Stands** :236
  constructor:237, buildBanners:352, addCloth:371, buildFlags:377, buildAway:402, setOpponent:420, setHome:442, react:466, cheer:475, chantEnv:478, setDetail:484, update:494, track:533, runFlashes:552

## src/graphics/surround.js (129 рядків)

buildSurround: усе поза трибунами матчу: земля, оточення, поїзд у кольорах Локо.

- Експорти: buildSurround:51
- Внутрішні функції: canvasTex:12, facadeTexture:20, windowsTexture:40

## src/graphics/textures.js (212 рядків)

Текстури, намальовані на canvas: атлас гравця (обличчя, номери), газон, сітка, тінь, вивіски. Борти — у boards.js.

- Експорти: ANISO:6, cellRect:29, faceCell:33, numberCell:39, sponsorCell:45, crestCell:46, playerAtlas:49, grassTexture:148, netTexture:177, netPlane:186, shadowTexture:194, signTexture:205
- Внутрішні функції: canvas:8, tex:14

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

## src/lab/audio-old.js (119 рядків)

Старий синтез (до оновлення звуку) для порівняння на сторінці прослуховування. У гру не потрапляє.

- **OldAudio** :2
  attach:3, clock:21, tone:22, hiss:33, kick:44, wall:45, coin:53, pass:58, save:59, whistle:60, horn:69, goal:81, concede:82, bell:83, rumble:84, click:85, back:86, buy:87, deny:88, win:89, lose:90, slowmo:91, beat:95, slide:96, clap:97, thud:98, crowd:99, post:101, net:102, crowdReact:103, renderMusic:105, startMusic:106, scheduleMusic:108

## src/lab/boards-lab.js (83 рядків)

Перегляд LED-бортів (boards.html): лише поле з бортами, камери гри й кіно, кнопки подій матчу й рівні деталізації; window.boards у консолі.

- Внутрішні функції: resize:73, tick:76

## src/lab/lab.css (34 рядків)

Стилі сторінки лабораторії (lab.html).

- Розділи: Стилі сторінки лабораторії (lab.html).:1

## src/lab/lab.js (548 рядків)

Лабораторія гравця (lab.html): окрема сторінка для перевірки моделі, ходи й анімацій; window.lab у консолі.

- Внутрішні функції: spawn:89, setWire:109, setJoints:118, start:132, divePrep:169, gkShot:179, stepBall:203, steer:237, tick:265, resize:349, setCam:365, renderCams:375, btn:383, row:384, select:385, range:390, swatches:395, check:400, renderPanel:406, test:465, actions:512

## src/lab/sound.css (32 рядків)

Стилі сторінки прослуховування звуку (sound.html).

- Розділи: Стилі сторінки прослуховування звуку (sound.html).:1

## src/lab/sound.js (301 рядків)

Сторінка прослуховування (sound.html): кнопка на кожен звук, старий/новий, сцена «хвилина матчу» й заміри через

- Внутрішні функції: ensureCtx:27, makeEngines:37, buildPhone:44, setPhone:53, trigger:118, stopAll:126, playScene:133, stopOldMusic:141, playOldMusic:142, fft:150, analyse:152, render:161, measure:179, measureScene:188, loopSeam:197, row:211, build:233

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

## src/match/match.js (3234 рядків)

Match: уся логіка матчу: фази, ввід удару, м'яч, відбори, воротарі, голи, кат-сцени, нагороди. Огляд: docs/ARCHITECTURE.md.

- **Match** :50
  constructor:51, start:94, formation:156, kickFor:200, timeText:203, periodBound:209, gameMin:210, overMin:212, extraText:213, minuteLabel:219, stoppage:225, ballFlying:230, calmBall:232, whistlePeriod:240, setClockHud:241, halfText:247, gkWaitBlock:255, pointerDown:257, joyStart:272, joyMove:280, pointerMove:282, pointerUp:284, hideAim:298, cancelAim:299, kickErr:305, shotMul:306, updateAim:308, cutAimAtMates:376, onWall:392, onPost:403, onBody:415, saveStep:486, catchLimit:492, legDeflect:499, creditSave:509, saveReact:515, controlScore:533, claimBall:556, tackleChance:575, addXp:577, showCard:580, bump:590, startTackle:602, updateTackles:618, resolveTackle:639, hasBall:671, looseBall:674, placeBallAt:690, trapMine:698, makeReady:715, trapOpp:731, clearReceivers:752, laneClear:755, passAim:761, choosePass:772, longTarget:805, passTo:822, recheckPass:838, kickYaw:853, carries:859, carry:866, kickApproach:891, kickReady:909, dribbleKick:919, kickFollow:933, doPass:946, launchFor:963, startShot:972, aimCounter:989, counterPath:995, takerThink:1007, updateTaker:1040, matesTackle:1156, releaseCounter:1169, remoteCtl:1184, gkHoldNow:1186, remoteWaiting:1187, remoteAimPose:1190, remoteHold:1197, remoteKick:1212, remoteRelease:1222, pickOppReceiver:1239, ricochetGoal:1261, pickMyReceiver:1267, launchShot:1288, kicked:1314, touched:1316, passer:1318, headingIn:1323, goalCredit:1332, onGoal:1341, updateGoal:1399, afterGoal:1412, pendingPause:1420, update:1423, nextPeriod:1470, timeOver:1481, procLead:1497, procAt:1509, driveIntro:1524, laneStep:1613, postStep:1645, skipIntroPart:1679, crowdBox:1696, detour:1708, steerAround:1731, introSeparate:1751, setGaze:1769, endIntro:1770, introCam:1784, clearCine:1824, startPens:1835, camInfo:1843, camOverride:1854, markMoment:1868, storeClip:1874, takeMoments:1882, startHighlights:1886, playClips:1892, nextClip:1897, updateClip:1908, endClips:1921, replayCam:1927, skipCine:1938, startBreak:1947, updateBreak:1959, endBreak:1979, breakCam:1984, assignEndRoles:1999, endShake:2042, endCam:2076, clearSlow:2099, updateSlow:2102, checkTackles:2126, oppLunging:2141, lungePause:2144, tacklePatience:2147, tackleReady:2153, updateDanger:2163, tick:2175, resolvePlayers:2284, updateSlides:2339, startSlide:2382, onSlideContact:2392, keeperCollect:2417, facesBall:2438, inGloves:2452, gkReceive:2472, gkRush:2485, startSmother:2501, resolveSmother:2512, updateKeepers:2525, launchDive:2675, lateReflex:2686, lateReflexAt:2694, goalImportance:2706, setupCelebration:2728, celebView:2748, fanBurst:2764, updateCelebration:2770, fallbackPick:2886, updateHolder:2904, keeperBodies:2937, updateSolidity:2958, animatePlayers:2970, syncView:2995, netBulge:3060, floatAt:3080, bigPass:3087, pause:3097, resume:3098, isPlaying:3099, endCelebrate:3102, endTalk:3139, end:3162, exit:3224

## src/match/penalty.js (458 рядків)

Penalties: серія пенальті: своя панель, приціл, стрибок воротаря, 3D-політ м'яча.

- **Penalties** :22
  constructor:23, start:25, build:45, dots:83, keeperMove:93, camOverride:106, setMark:114, placeMark:123, begin:132, decide:157, fire:175, announce:192, verdict:205, update:220, liveStep:229, ballStep:321, judge:418, endKick:431, dispose:443, unbindKeys:444, post:447, finish:449

## src/match/ring.js (46 рядків)

RingTone: колір кільця під м'ячем за станом гри (вільно, тиск, зона удару, загроза нашим воротам). Спільний для Match і GuestMatch.

- **RingTone** :13
  constructor:14, reset:15, update:22

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

## src/online/guest.js (434 рядків)

Гість онлайн-матчу: показує гру господаря й керує своєю командою.

- **GuestMatch** :34
  constructor:35, start:51, onRef:75, onFrame:80, onEvent:106, renderT:109, applyEvent:112, update:183, blend:223, header:245, camInfo:301, camOverride:310, celebView:311, isPlaying:313, pause:314, resume:315, startPens:316, skipCine:317, canAim:320, pointerDown:321, joyStart:331, joyMove:338, pointerMove:339, pointerUp:340, cancelAim:350, hideAim:351, sendAim:352, updateAim:355, cutAimAtMates:408, exit:423

## src/online/host.js (116 рядків)

Господар онлайн-матчу: його гра — єдина правда. Він рахує фізику, ШІ і правила для обох команд, а гостю шле:

- **HostLink** :13
  constructor:14, install:21, uninstall:35, sendRef:37, resync:39, hud:45, ev:54, newPoss:57, timedOut:59, wake:61, onMsg:64, frame:87

## src/online/names.js (64 рядків)

Імена героїв онлайн-клубу: українське ім'я + прізвище, зібране за справжніми зразками (суфікси, козацькі складені,

- Експорти: FIRST_NAMES:7, newName:52, SURNAME_POOLS:64

## src/online/net.js (232 рядків)

Мережа онлайн-матчу: кімната за кодом через PeerJS (публічний сервер лише знайомить двох гравців), далі — пряме

- Експорти: PROTO:14, makeCode:15, cleanCode:16
- Внутрішні функції: tabToken:31, loadPeer:37, ownConfig:46, openPeer:54, openWith:65
- **Net** :76
  constructor:77, on:82, emit:83, kept:86, watch:92, host:100, join:122, connectTo:134, attach:147, setupStream:164, onMsg:175, startPing:182, send:194, sendFrame:196, drop:202, offline:205, lost:207, rejoin:215, close:222

## src/online/profile.js (269 рядків)

Онлайн-клуб гравця: окремий від кар'єри «Локомотива» — своя назва, прапор, форма, 11 унікальних героїв, рівень,

- Експорти: esc:15, TRAITS:23, RARITY:36, ONLINE_FORMS:45, slotsOf:46, ONLINE_AIM:49, ONLINE_GK:50, newHero:54, newClub:69, OP:142, saveOP:143, markLive:145, clearLive:146, settleLive:147, resetOP:148, kitOf:154, awayKit:161, gkKitOf:167, shortOf:168, heroOvr:172, teamRating:173, trainPrice:174, SCOUT_PRICE:175, clubXpNeed:176, trainHero:178, setForm:185, swapHeroes:190, scoutHero:196, toWire:205, plain:216, fromWire:220, matchClub:242, applyResult:249
- Внутрішні функції: repair:82, migrate:117, load:124

## src/online/screen.js (384 рядків)

Вкладка «Онлайн» у меню: свій онлайн-клуб (назва, прапор, рівень, рейтинг), герої з прокачкою і гра з людиною

- **OnlineScreen** :31
  constructor:32, onMenu:59, subKey:67, playState:68, html:70, clubCard:87, clubTiles:93, kitsHtml:98, clubHtml:102, feHtml:122, dice:123, thumb:124, feGen:125, feField:133, feEmblem:138, feColors:156, feExtra:163, rollCands:169, remember:170, patchFlag:172, patchFe:179, flagDone:189, syncSoon:192, look:195, afterRender:196, heroDetail:197, heroesHtml:209, revealHero:211, playHtml:220, stampOf:257, oppCard:259, patchOpp:264, input:276, setColor:297, act:298, copy:354, showResult:360

## src/online/server.js (95 рядків)

Сервер гри (папка server/): вхід через Telegram, власний PeerJS і паролі до ретранслятора.

- Експорти: SERVER_URL:8, serverOn:18, markDown:20, peerServer:23, login:50, roomShareId:80, iceServers:86
- Внутрішні функції: api:29, stored:42, store:45, authed:65

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

## src/state/squad.js (268 рядків)

Склад: реальний ROSTER, навички, рівні, заміни, тренування, склади суперників (oppSquad).

- Експорти: STAT_NAMES:10, STAT_HINT:11, keysFor:15, ROLE_UA:16, myKit:34, matchKit:36, makeStats:39, ovr:44, xpNeed:49, trainCost:51, tierOf:52, newEntry:58, ROSTER:72, defaultSquad:95, ensureSquad:103, allPlayers:117, swapPlayers:120, CAREER_FORMS:132, setTactic:138, swapStarters:140, bestLine:145, oppSquad:157, skillOf:187, gkBonus:194, squadLook:201, lookSig:208, customizeLook:211, resetLook:218, gainXp:225, trainStat:241, signGraduate:250, squadRating:268
- Внутрішні функції: rosterEntry:83, relabelSquad:134

## src/style.css (1677 рядків)

Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.

- Розділи: Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.:1 · кнопки:42 · сплеш:56 · панелі:66 · джойстик і мобільна зручність:113 · символіка клубу:142 · склад, картка гравця:155 · оверлеї:194 · результат:213 · HUD:231 · дрібні події (ВІДБІР, ВРЯТУВАВ, ПАС, ШТАНГА…): підказка, а не крик — лише текст, без плашки; тінь тільки для читабельності на газоні:263 · поверни пристрій:283 · анімації:292 · емблема-картинка заповнює свій контейнер:314 · заставка запуску (src/ui/intro.js): повний герб «Локомотива», з тунелю в червоному трикутнику виїжджає локомотив:322 · деталі крутяться навколо себе, а те, що рухається в координатах герба, від його початку:330 · редактор вигляду:339 · серія пенальті:356 · адаптація вікон під низькі екрани (телефон у ландшафті): вміст прокручується, кнопка «закрити» завжди на місці:375 · табло як на телебаченні: компактна плашка зліва вгорі:398 · анімації табло:415 · картка гравця з м'ячем: компактніша:434 · підказка для iPhone: встановити на початковий екран:443 · головна: ЛОКО РАШ. Власні літери й вхід у src/ui/splash.js; плоскі кольори, без градієнтів і світіння:448 · літери:454 · заслін: темне поле з отвором у літері O, летить на камеру й зникає:463 · кнопка: плоский блок із твердим об'ємом, як літери:475 · діагональні смуги лівреї на екрані результату й панелях:484 · підказка iPhone праворуч від назви:492 · налаштування джойстика: рядок не накладається на «На весь екран»:497 · верхній ряд:524 · маршрут ліги:534 · гаманець:555 · бічні: табличка клубу і табло:568 · низ: прокачка, вкладки, «ВПЕРЕД!»:630 · прокачка стадіону — кремова коса табличка:633 · вкладки — косі плитки лівреї, активна червона з кремовою рискою:651 · «ВПЕРЕД!» — та сама коса кнопка, що й на заставці, тільки більша:659 · поява меню:685 · вузькі екрани (4:3, 16:10) і низькі телефони:721 · текст не вилазить за межі блоків:735 · картки в панелях: нічого не стискається поверх сусіда, а що не влізло — гортається всередині картки:739 · джойстик: плавна поява, у катсценах прихований:766 · пауза:781 · налаштування:823 · низьке або вузьке вікно: Налаштування на всю висоту, а якщо вкладки однаково не вміщаються, вони прокручуються:867 · табличка доданого часу — як LED-табло резервного судді:957 · смужка автора гола під табло:966 · велике табло рахунку: перерви й фінальний свисток:980 · напис гола й автогола: заголовок у центрі згасає, плашка автора внизу лишається до повтору:1020 · представлення суперника на виході команд:1060 · довга назва: fitText зменшує шрифт, а як не вистачає — переносить; трикрапки немає:1061 · годинник: хвилина перекидається, секунди біжать рівно, смужка тайму; до розведення годинник стоїть (блимає двокрапка):1102 · онлайн: п'ята вкладка меню, онлайн-клуб, кімната за кодом:1120 · смуга зверху в кольорах клубу й косий штрих на тлі:1136 · вхідні анімації вмісту: лише при новій сторінці:1163 · кнопки в ліврею:1172 · полотно, що майорить:1183 · сцена під прапором: промені в кольорах клубу:1194 · лобі:1267 · клуб і редактор прапора:1292 · герої: тактичне поле, гравець на весь зріст, навички:1372 · низький екран (телефон лежачи): панель займає весь екран, меню за нею ховається:1456 · палець: більші цілі, без залиплого наведення, легші анімації:1467 · сяйво й промені за заголовком:1514 · конфеті:1523 · заголовок: літери падають згори з перельотом, потім по ньому пробігає відблиск:1536 · табло: два герби на косих плитах, рахунок «грюкає»:1553 · автори голів — під своєю командою:1575 · каса праворуч: плита з рейками-смугами, рядки виїжджають, суми дораховуються:1589 · кнопки — як у паузі:1616 · повторне малювання того самого вікна: вхідні анімації не повторюються:1636 · мінімапа матчу (ui/minimap.js):1639

## src/ui/hud.js (304 рядків)

Hud: табло матчу, годинник, картка гравця, банери. Методи з HUD_FWD (online/host.js) віддзеркалюються гостю.

- Експорти: GOAL_KEYS:11, fitText:17
- **Hud** :28
  constructor:29, show:71, hide:88, matchday:95, setScore:127, setTime:139, setProg:158, addedTime:165, scored:172, scoreCard:181, setSignal:201, pauseDim:207, setCoins:209, bump:213, warn:215, hint:221, combo:226, banner:232, goal:244, clearGoal:274, cine:276, setCard:286, clearFloats:297, float:298

## src/ui/icons.js (34 рядків)

Прості вбудовані SVG-іконки: без емодзі та зовнішніх файлів.

- Експорти: I:4, crest:26, lokoCrest:32

## src/ui/intro.js (417 рядків)

playIntro: заставка запуску: офіційний герб «Локомотива» Київ; з тунелю в червоному трикутнику виїжджає локомотив і стає на своє місце (SVG, WAAPI).

- Експорти: playIntro:242
- Внутрішні функції: scene:62, smokePx:138, textures:168, timeAt:184, suspension:213

## src/ui/minimap-demo.js (214 рядків)

DemoMatch: маленька гра для зразка мінімапи в налаштуваннях: розстановки, пресинг, паси, удари, сейви, голи й аути. На справжній матч не впливає.

- **DemoMatch** :14
  constructor:15, lineUp:29, start:33, give:37, formation:40, press:54, stepPlayers:65, nearest:75, choosePass:83, pass:97, shoot:106, stepBall:113, goal:144, dead:149, step:154

## src/ui/minimap.js (494 рядків)

Мінімапа матчу: Minimap малює поле, гравців, напрямок бігу й траєкторію м'яча; MapHud ставить її на екран і веде режим перетягування.

- **Minimap** :49
  constructor:50, attach:63, setKits:65, resize:72, sx:82, sy:83, bake:85, reset:114, read:117, demo:136, sample:139, tick:162, draw:173, drawView:187, drawRuns:198, drawBallPath:213, drawTeam:241, nearBall:253, drawBall:259
- **MapHud** :273
  constructor:274, apply:294, setKits:306, applyAlpha:312, layout:318, compute:328, planHtml:357, refreshPlan:373, animatePlan:379, placeJoyZone:387, update:397, ballCheck:412, pauseCheck:421, bindPreview:432, fitPreview:440, place:445, resetPlace:446, setEdit:448, syncBar:454, initDrag:459

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

## src/ui/ui.js (983 рядків)

UI: меню, панелі, пауза, налаштування, результат, джойстик. Кнопки: data-act -> UI.act.

- Внутрішні функції: countTo:28, redraw:49
- **UI** :55
  constructor:56, onResize:155, key:166, goBack:183, canGoBack:192, hideSplash:197, splashReady:206, isIOS:221, isStandalone:222, iosHint:223, useJoy:231, setMatchUi:235, applyControls:236, joyCenter:255, placeJoy:260, initJoy:265, act:313, kitNote:380, setJoyEdit:386, editDone:392, menuTap:398, toast:407, setSlow:412, flash:413, showMenu:419, tiltNav:430, rollFlaps:442, hideMenu:459, leagueStrip:466, refresh:481, menuCards:498, fitFlaps:539, clock:548, tickCash:553, claimCash:561, deny:569, pop:570, buyStadium:572, openPanel:583, panelCovers:592, closePanel:593, renderPanel:601, showTier:619, statBar:625, teamSheet:628, careerLook:640, careerDetail:641, squadHtml:654, train:673, transfersHtml:681, academyHtml:698, stadiumHtml:713, chronicleHtml:731, symbolsHtml:741, buy:752, equip:761, collectGraduate:767, boostAcademy:787, openCustom:797, closeCustom:800, customAct:801, renderCustom:818, openSettings:841, closeSettings:844, renderSettings:845, pause:888, showResult:904, renderResult:933, hideResult:982

## src/ui/vox.js (82 рядків)

Воксельні іконки в ізометрії: ті самі кубики, з яких складена гра, лише в SVG.

- Експорти: VOX:48
- Внутрішні функції: shade:7, vox:13
