# Карта коду

Згенеровано `npm run docs:map`, руками не правити. Запис `назва:рядок` веде до оголошення в цьому файлі.
Рядки зсуваються з кожною правкою: якщо карта застаріла, перегенеруй її або шукай за назвою.

## src/club.js (61 рядків)

Ідентичність ФК «Локомотив» Київ: історія, символіка, факти. Джерела: Вікіпедія (FC Lokomotyv Kyiv),

- Експорти: CLUB:4, CHRONICLE:15, FACTS:31, LEGENDS:43, ALUMNI:44, HONOURS:46, STADIUM:51, randomFact:61

## src/config.js (196 рядків)

Усі числові константи гри в одному місці.

- Експорти: PITCH:3, PHYS:20, COL:35, KIT_LOKO:42, KITS:44, KIT_GK_LOKO:49, KIT_CLASH:52, kitDist:55, pickKit:60, LEAGUES:74, STAT_KEYS:88, GK_KEYS:89, LINE_OF:90, FORMATIONS:95, FIXTURES:105, matchSpec:111, STRIKERS:134, shotSkill:144, KEEPERS:146, ACADEMY:154, STADIUM_TIERS:174, STADIUM_TIER_NAMES:175, SETTINGS_DEFAULT:177, CAM_PRESETS:189

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

## src/core/game.js (651 рядків)

Game: рендерер, сцена меню, стейт-машина MENU/MATCH/GOAL/RESULT, головний цикл, ввід, камера матчу, якість.

- Експорти: gfxFail:28
- Внутрішні функції: springStep:22
- **Game** :38
  constructor:39, cineFlat:88, ensureMatch:100, startSplash:103, splashView:119, startStage:125, stopStage:132, stageCam:134, updateSplash:144, splashBall:170, splashBallStep:187, splashRoar:206, stopSplash:208, warmShaders:221, buildStates:234, play:275, toMenu:279, quitMatch:280, onStadiumUpgraded:282, resize:287, basePixelRatio:298, applyPixelRatio:307, resMin:318, fixedLevel:321, setLevel:323, qualityChanged:330, levelDown:340, governor:355, onGlLost:398, onGlRestored:405, onVisibility:411, updateMenuCam:418, computeMatchBase:432, snapCamera:433, addTrauma:435, fovKick:437, updateMatchCam:439, autoFocus:497, screenToGround:513, worldToScreen:524, acquireWake:531, floatWorld:540, bindInput:547, isFullscreen:593, enterFullscreen:594, toggleFullscreen:602, tick:609, onFrameError:617, step:626

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

## src/graphics/stands.js (562 рядків)

Stands: трибуни й глядачі (анімація в шейдерах), реакції натовпу на гру, банери, прапори, сектор гостей.

- Внутрішні функції: drawAtlas:15, bannerAtlas:30, bannerMat:90, pin:99, crowdMat:213
- **Stands** :235
  constructor:236, buildBanners:351, addCloth:370, buildFlags:376, buildAway:400, setOpponent:418, setHome:440, react:464, cheer:473, chantEnv:476, setDetail:482, update:492, track:531, runFlashes:550

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

## src/online/cloud.js (140 рядків)

Онлайн-хаб на сервері гри (контракт API 2, server/README.md): клуб, підтверджений результат матчу, квести, таблиця.

- **Cloud** :13
  constructor:14, refresh:18, open:22, dirty:35, resync:41, train:43, scout:53, buy:55, reset:66, ticketOk:76, start:81, report:87, questsOn:105, loadQuests:106, setQuests:107, view:114, ready:123, claim:125, rollover:136, loadTop:139

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

## src/online/modes.js (17 рядків)

Режими онлайн-хабу: плитки вкладки «Матч» (screen.js). Новий режим, наприклад турнір, — новий запис тут; решту хабу міняти не треба.

- Експорти: MODES:7, modeTabs:17

## src/online/names.js (64 рядків)

Імена героїв онлайн-клубу: українське ім'я + прізвище, зібране за справжніми зразками (суфікси, козацькі складені,

- Експорти: FIRST_NAMES:7, newName:52, SURNAME_POOLS:64

## src/online/net.js (232 рядків)

Мережа онлайн-матчу: кімната за кодом через PeerJS (публічний сервер лише знайомить двох гравців), далі — пряме

- Експорти: PREFIX:10, PROTO:14, makeCode:15, cleanCode:16, loadPeer:37, openPeer:54
- Внутрішні функції: tabToken:31, ownConfig:46, openWith:65
- **Net** :76
  constructor:77, on:82, emit:83, kept:86, watch:92, host:100, join:122, connectTo:134, attach:147, setupStream:164, onMsg:175, startPing:182, send:194, sendFrame:196, drop:202, offline:205, lost:207, rejoin:215, close:222

## src/online/profile.js (333 рядків)

Онлайн-клуб гравця: окремий від кар'єри «Локомотива» — своя назва, прапор, форма, 11 унікальних героїв, рівень,

- Експорти: esc:15, TRAITS:23, RARITY:36, ONLINE_FORMS:45, slotsOf:46, ONLINE_AIM:49, ONLINE_GK:50, newHero:54, newClub:69, OP:147, saveOP:148, markLive:150, clearLive:151, settleLive:152, toServer:156, adoptServer:169, adoptHero:184, resetOP:193, kitOf:199, awayKit:206, gkKitOf:212, shortOf:213, heroOvr:217, teamRating:218, trainPrice:219, SCOUT_PRICE:220, clubXpNeed:221, trainHero:223, setForm:230, swapHeroes:235, PACKS:244, packRarity:250, buyPack:256, scoutHero:264, toWire:268, plain:280, fromWire:284, matchClub:306, applyResult:313
- Внутрішні функції: repair:82, migrate:122, load:129, toWireHero:275

## src/online/quests.js (144 рядків)

Квести онлайн-клубу: 3 денні (легкий, середній, важкий) і 1 тижневий. Набір однаковий для всіх гравців: зерно — дата за Києвом,

- Експорти: questDef:33, questsLeft:54, questPeriods:69, dayIds:71, weekIds:72, questStep:74, syncQuests:87, questList:99, questsReady:105, claimQuest:112, matchFacts:123, factsOf:125, questMatch:133
- Внутрішні функції: kyiv:38, rng:61, bank:79

## src/online/screen.js (636 рядків)

Онлайн-хаб: окремий розділ гри на весь екран (меню кар'єри за ним сховане). Свій верх (назад у кар'єру, клуб, монети онлайн-клубу)

- **OnlineScreen** :52
  constructor:53, onMenu:90, subKey:98, playState:99, tabs:104, onOpen:106, back:113, html:119, questCard:142, questsHtml:149, topHtml:157, clubCard:168, clubTiles:174, kitsHtml:179, clubHtml:183, feHtml:203, dice:204, thumb:205, feGen:206, feField:214, feEmblem:219, feColors:237, feExtra:244, rollCands:250, remember:251, patchFlag:253, patchFe:260, flagDone:270, syncSoon:273, look:276, afterRender:277, heroDetail:278, heroesHtml:290, revealHero:292, star:311, starHtml:313, mountStar:318, slideHtml:324, homeHtml:336, featInit:354, featGo:380, shopHtml:390, buy:411, restage:431, playHtml:434, stampOf:474, oppCard:476, patchOpp:481, input:493, setColor:514, act:515, copy:605, showResult:611

## src/online/seek.js (99 рядків)

Швидкий матч без черги на сервері: «маяки» на фіксованих адресах PeerJS (SLOTS штук на версію протоколу).

- Експорти: SLOTS:9
- **Seeker** :14
  constructor:15, kept:18, probePeer:23, scan:32, ask:38, light:61, serve:78, lit:89, dim:90, stop:94

## src/online/server.js (151 рядків)

Сервер гри (папка server/): вхід через Telegram, власний PeerJS і паролі до ретранслятора.

- Експорти: SERVER_URL:8, serverOn:18, markDown:20, peerServer:23, login:50, features:89, has:100, saveClub:111, meOnServer:112, trainOnServer:113, scoutOnServer:114, packOnServer:116, resetOnServer:117, matchStart:122, matchReport:123, matchState:124, queueJoin:126, queueLeave:127, queueStats:128, serverQuests:130, claimOnServer:131, topList:133, roomShareId:136, iceServers:142
- Внутрішні функції: api:29, stored:42, store:45, authed:65, call:106

## src/online/session.js (410 рядків)

Онлайн-сесія: кімната за кодом або швидкий пошук (маяки, seek.js) → лобі (обидва бачать клуби одне одного й тиснуть «Готовий») → матч → результат

- **Online** :28
  constructor:29, role:42, inMatch:43, sendVis:44, onVis:46, busy:58, unready:60, refresh:61, setErr:62, create:65, join:72, seek:81, qloop:99, patchSeek:119, unqueue:124, relight:126, seekJoin:136, retrySeek:146, reseek:148, stopSeek:153, why:155, bind:165, hello:198, sync:200, onMsg:205, setReady:250, buildSpec:259, me:270, startMatch:272, beginGuest:292, onTicket:311, finish:319, guestEnd:335, leave:343, techLoss:353, stopMatch:359, oppLeft:366, dropped:380, rematch:387, toLobby:391, close:399

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

## src/style.css (1978 рядків)

Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.

- Розділи: Стилі основної гри; розділи перелічені в docs/CODE_MAP.md.:1 · кнопки:35 · сплеш:49 · панелі:59 · джойстик і мобільна зручність:106 · символіка клубу:135 · склад, картка гравця:148 · оверлеї:187 · результат:206 · HUD:224 · дрібні події (ВІДБІР, ВРЯТУВАВ, ПАС, ШТАНГА…): підказка, а не крик — лише текст, без плашки; тінь тільки для читабельності на газоні:250 · поверни пристрій:270 · анімації:279 · емблема-картинка заповнює свій контейнер:301 · заставка запуску (src/ui/intro.js): повний герб «Локомотива», з тунелю в червоному трикутнику виїжджає локомотив:309 · деталі крутяться навколо себе, а те, що рухається в координатах герба, від його початку:315 · редактор вигляду:324 · серія пенальті:341 · адаптація вікон під низькі екрани (телефон у ландшафті): вміст прокручується, кнопка «закрити» завжди на місці:360 · табло як на телебаченні: компактна плашка зліва вгорі:383 · анімації табло:400 · картка гравця з м'ячем: компактніша:419 · підказка для iPhone: встановити на початковий екран:428 · головна: ЛОКО РАШ. Власні літери й вхід у src/ui/splash.js; плоскі кольори, без градієнтів і світіння:433 · літери:439 · заслін: темне поле з отвором у літері O, летить на камеру й зникає:448 · кнопка: плоский блок із твердим об'ємом, як літери:460 · діагональні смуги лівреї на екрані результату й панелях:469 · підказка iPhone праворуч від назви:477 · налаштування джойстика: рядок не накладається на «На весь екран»:482 · верхній ряд:509 · маршрут ліги:519 · гаманець:540 · бічні: табличка клубу і табло:553 · низ: прокачка, вкладки, «ВПЕРЕД!»:615 · прокачка стадіону — кремова коса табличка:618 · вкладки — косі плитки лівреї, активна червона з кремовою рискою:636 · «ВПЕРЕД!» — та сама коса кнопка, що й на заставці, тільки більша:644 · поява меню:670 · вузькі екрани (4:3, 16:10) і низькі телефони:706 · текст не вилазить за межі блоків:720 · картки в панелях: нічого не стискається поверх сусіда, а що не влізло — гортається всередині картки:724 · джойстик: плавна поява, у катсценах прихований:751 · пауза:766 · налаштування:808 · низьке або вузьке вікно: Налаштування на всю висоту, а якщо вкладки однаково не вміщаються, вони прокручуються:852 · табличка доданого часу — як LED-табло резервного судді:942 · смужка автора гола під табло:951 · велике табло рахунку: перерви й фінальний свисток:965 · напис гола й автогола: заголовок у центрі згасає, плашка автора внизу лишається до повтору:1005 · представлення суперника на виході команд:1045 · довга назва: fitText зменшує шрифт, а як не вистачає — переносить; трикрапки немає:1046 · годинник: хвилина перекидається, секунди біжать рівно, смужка тайму; до розведення годинник стоїть (блимає двокрапка):1087 · онлайн: п'ята вкладка меню, онлайн-клуб, кімната за кодом:1105 · смуга зверху в кольорах клубу й косий штрих на тлі:1121 · вхідні анімації вмісту: лише при новій сторінці:1148 · кнопки в ліврею:1157 · полотно, що майорить:1168 · сцена під прапором: промені в кольорах клубу:1179 · лобі:1252 · клуб і редактор прапора:1277 · герої: тактичне поле, гравець на весь зріст, навички:1357 · онлайн-хаб: окремий розділ гри на весь екран (src/online/screen.js):1441 · затемнення під текстом над стадіоном: угорі під шапкою, унизу під панеллю, ліворуч під зіркою; середина кадру світла:1453 · шапка: назад, клуб (прапор, назва, рівень і досвід, рейтинг), монети:1458 · вкладки з редакторами над стадіоном: суцільні поверхні, інакше дрібний текст тоне в трибунах:1468 · низ: розділи на всю ширину; активний — червона коса плита, решта на темному тлі:1479 · головна (вкладка «Матч»): зірка клубу на весь зріст ліворуч, сітка праворуч:1494 · карусель режимів: сторінки на всю плитку, гортає лише гравець (пальцем, мишею, колесом, крапками):1509 · плитки поруч: клуб (поле кольору форми), гра з другом, квести дня:1533 · кнопка «Клуб» у шапці поруч із монетами:1566 · вкладка «Магазин»: паки ліворуч (поля кольору рідкості), праворуч кого замінити й «Купити»:1573 · пошук суперника:1608 · вкладка «Квести»:1619 · вкладка «Рейтинг» (лише із сервером гри):1643 · онлайн-хаб: воксельні предмети (src/ui/vox.js) — ті самі кубики, з яких складена гра:1671 · навігація: воксельні іконки, як у кар'єрі. Предмет не виходить із рамки кнопки: відкрита вкладка лише раз оживає (клас fx, screen.js):1672 · «Матч»: м'яч двічі підскакує перед воротами (і на слайді швидкого матчу):1682 · «Квести»: галочки ставляться по черзі:1690 · «Магазин» і паки: вагон із контейнером під'їжджає рейками й гальмує:1695 · «Герої»: гравці підстрибують по черзі:1699 · «Рейтинг»: кубок падає на першу сходинку:1703 · квести: предмет у картці вистрибує слідом за самою карткою:1709 · квести: предмет ліворуч від назви; виконаний підстрибує, забраний тьмяніє:1712 · магазин: контейнер чи бінокль праворуч на плитці паку; обраний пак погойдується на рейках:1724 · головна: турніри — сірий кубок; гра з другом — двоє гравців із м'ячем; клуб — прапор, що майорить:1733 · відкриття паку: контейнер тремтить дедалі сильніше, крізь щілини світло кольору рідкості, спалах — і картка героя:1740 · низький екран (телефон лежачи): панель займає весь екран, меню за нею ховається:1757 · палець: більші цілі, без залиплого наведення, легші анімації:1768 · сяйво й промені за заголовком:1815 · конфеті:1824 · заголовок: літери падають згори з перельотом, потім по ньому пробігає відблиск:1837 · табло: два герби на косих плитах, рахунок «грюкає»:1854 · автори голів — під своєю командою:1876 · каса праворуч: плита з рейками-смугами, рядки виїжджають, суми дораховуються:1890 · кнопки — як у паузі:1917 · повторне малювання того самого вікна: вхідні анімації не повторюються:1937 · мінімапа матчу (ui/minimap.js):1940

## src/ui/hud.js (300 рядків)

Hud: табло матчу, годинник, картка гравця, банери. Методи з HUD_FWD (online/host.js) віддзеркалюються гостю.

- Експорти: GOAL_KEYS:11, fitText:17
- **Hud** :28
  constructor:29, show:71, hide:87, matchday:94, setScore:126, setTime:138, setProg:157, addedTime:164, scored:171, scoreCard:180, setSignal:200, setCoins:205, bump:209, warn:211, hint:217, combo:222, banner:228, goal:240, clearGoal:270, cine:272, setCard:282, clearFloats:293, float:294

## src/ui/icons.js (38 рядків)

Прості вбудовані SVG-іконки: без емодзі та зовнішніх файлів.

- Експорти: I:4, crest:30, lokoCrest:36

## src/ui/intro.js (378 рядків)

playIntro: заставка запуску: офіційний герб «Локомотива» Київ; з тунелю в червоному трикутнику виїжджає локомотив і стає на своє місце (SVG, WAAPI).

- Експорти: playIntro:223
- Внутрішні функції: scene:62, smokeTex:137, timeAt:165, suspension:194

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

## src/ui/portrait.js (124 рядків)

portrait: рендерить 3D-модель гравця один раз у PNG для карток.

- Експорти: portrait:22, mountTurntable:114
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

## src/ui/ui.js (991 рядків)

UI: меню, панелі, пауза, налаштування, результат, джойстик. Кнопки: data-act -> UI.act.

- Внутрішні функції: countTo:28, redraw:49
- **UI** :55
  constructor:56, onResize:155, key:166, goBack:183, canGoBack:193, hideSplash:198, splashReady:207, isIOS:222, isStandalone:223, iosHint:224, useJoy:232, setMatchUi:236, applyControls:237, joyCenter:256, placeJoy:261, initJoy:266, act:314, kitNote:379, setJoyEdit:385, editDone:391, menuTap:397, toast:406, setSlow:411, flash:412, showMenu:418, tiltNav:429, rollFlaps:441, hideMenu:458, leagueStrip:465, refresh:480, menuCards:497, fitFlaps:538, clock:547, tickCash:552, claimCash:560, deny:568, pop:569, buyStadium:571, openPanel:582, panelCovers:595, leaveHub:600, closePanel:601, renderPanel:609, showTier:627, statBar:633, teamSheet:636, careerLook:648, careerDetail:649, squadHtml:662, train:681, transfersHtml:689, academyHtml:706, stadiumHtml:721, chronicleHtml:739, symbolsHtml:749, buy:760, equip:769, collectGraduate:775, boostAcademy:795, openCustom:805, closeCustom:808, customAct:809, renderCustom:826, openSettings:849, closeSettings:852, renderSettings:853, pause:896, showResult:912, renderResult:941, hideResult:990

## src/ui/vox.js (292 рядків)

Воксельні іконки в ізометрії: ті самі кубики, з яких складена гра, лише в SVG.

- Експорти: VOX:179
- Внутрішні функції: shade:13, nearer:20, order:31, hidden:50, ballSvg:63, vox:83, digits:142, container:163
