// Created By Bismaya. If you use this code or parts of it, please give credit to Bismaya as the original creator.
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

const mouse = { x: canvas.width / 2, y: canvas.height / 2 };
const targetMouse = { x: canvas.width / 2, y: canvas.height / 2 };
const prevMouse = { x: canvas.width / 2, y: canvas.height / 2 };

let mouseOnScreen = true;
let mouseJustReturned = false;

let creatureSpeed = 0;
let smoothSpeed = 0;
let lastTime = Date.now();
let bodyVelocity = { x: 0, y: 0 };

const boundaryPadding = 30;

document.addEventListener('mousemove', (e) => {
    const newX = e.clientX;
    const newY = e.clientY;

    if (mouseJustReturned) {
        mouseJustReturned = false;
        prevMouse.x = targetMouse.x;
        prevMouse.y = targetMouse.y;
        smoothSpeed = 0;
    }

    targetMouse.x = Math.max(boundaryPadding, Math.min(canvas.width - boundaryPadding, newX));
    targetMouse.y = Math.max(boundaryPadding, Math.min(canvas.height - boundaryPadding, newY));
    mouseOnScreen = true;
});

document.addEventListener('mouseleave', () => {
    mouseOnScreen = false;
});

document.addEventListener('mouseenter', () => {
    mouseJustReturned = true;
    mouseOnScreen = true;
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        mouseOnScreen = false;
    } else {
        mouseJustReturned = true;
        lastTime = Date.now();
    }
});

const spineSegments = [];
const numSpineSegments = 20;
const spineSpacing = 18;

for (let i = 0; i < numSpineSegments; i++) {
    spineSegments.push({
        x: canvas.width / 2,
        y: canvas.height / 2 + i * spineSpacing,
        angle: Math.PI / 2,
        width: Math.max(8, 28 - i * 1.2)
    });
}

const legPairs = [
    { spineIndex: 2, upperLen: 45, lowerLen: 55, spread: 0.8 },
    { spineIndex: 5, upperLen: 50, lowerLen: 60, spread: 0.9 },
    { spineIndex: 8, upperLen: 45, lowerLen: 55, spread: 0.85 },
    { spineIndex: 11, upperLen: 40, lowerLen: 50, spread: 0.8 },
    { spineIndex: 14, upperLen: 35, lowerLen: 45, spread: 0.7 },
    { spineIndex: 17, upperLen: 25, lowerLen: 35, spread: 0.6 }
];

const legs = [];
legPairs.forEach((config, pairIndex) => {
    [-1, 1].forEach(side => {
        const reach = (config.upperLen + config.lowerLen) * 0.7;
        legs.push({
            ...config,
            side: side,
            pairIndex: pairIndex,
            footX: canvas.width / 2 + side * reach,
            footY: canvas.height / 2,
            targetFootX: canvas.width / 2 + side * reach,
            targetFootY: canvas.height / 2,
            prevFootX: canvas.width / 2 + side * reach,
            prevFootY: canvas.height / 2,
            renderFootX: canvas.width / 2 + side * reach,
            renderFootY: canvas.height / 2,
            renderLiftHeight: 0,
            isMoving: false,
            stepPhase: 0,
            liftHeight: 0,
            tripodGroup: (pairIndex % 2) ^ (side === 1 ? 1 : 0),
            lastStepTime: 0
        });
    });
});

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function constrain(px, py, ax, ay, dist) {
    const dx = px - ax;
    const dy = py - ay;
    const currentDist = Math.sqrt(dx * dx + dy * dy);
    if (currentDist < 0.001) return { x: ax + dist, y: ay };
    const scale = dist / currentDist;
    return {
        x: ax + dx * scale,
        y: ay + dy * scale
    };
}

function solveIK(shoulderX, shoulderY, targetX, targetY, len1, len2, bendDirection) {
    const dx = targetX - shoulderX;
    const dy = targetY - shoulderY;
    let dist = Math.sqrt(dx * dx + dy * dy);

    const maxDist = len1 + len2 - 2;
    const minDist = Math.abs(len1 - len2) + 2;
    dist = Math.max(minDist, Math.min(maxDist, dist));

    const angleToTarget = Math.atan2(dy, dx);

    const cosAngle = (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist);
    const clampedCos = Math.max(-1, Math.min(1, cosAngle));
    const shoulderAngle = Math.acos(clampedCos);

    const upperAngle = angleToTarget + shoulderAngle * bendDirection;

    const elbowX = shoulderX + Math.cos(upperAngle) * len1;
    const elbowY = shoulderY + Math.sin(upperAngle) * len1;

    const lowerAngle = Math.atan2(targetY - elbowY, targetX - elbowX);

    return {
        elbowX, elbowY,
        upperAngle, lowerAngle
    };
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

function angleDiff(from, to) {
    return normalizeAngle(to - from);
}

function updateSpine() {
    const now = Date.now();
    const deltaTime = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (!mouseOnScreen || document.hidden) {
        smoothSpeed = lerp(smoothSpeed, 0, 0.15);
        creatureSpeed = Math.min(smoothSpeed / 800, 1);

        bodyVelocity.x = lerp(bodyVelocity.x, 0, 0.15);
        bodyVelocity.y = lerp(bodyVelocity.y, 0, 0.15);

        const head = spineSegments[0];
        head.x = Math.max(boundaryPadding, Math.min(canvas.width - boundaryPadding, head.x));
        head.y = Math.max(boundaryPadding, Math.min(canvas.height - boundaryPadding, head.y));

        const segmentSmooth = 0.3;
        for (let i = 1; i < spineSegments.length; i++) {
            const seg = spineSegments[i];
            const prev = spineSegments[i - 1];
            const constrained = constrain(seg.x, seg.y, prev.x, prev.y, spineSpacing);
            seg.x = lerp(seg.x, constrained.x, segmentSmooth);
            seg.y = lerp(seg.y, constrained.y, segmentSmooth);

            seg.x = Math.max(boundaryPadding, Math.min(canvas.width - boundaryPadding, seg.x));
            seg.y = Math.max(boundaryPadding, Math.min(canvas.height - boundaryPadding, seg.y));

            seg.angle = Math.atan2(prev.y - seg.y, prev.x - seg.x);
        }

        legs.forEach(leg => {
            leg.renderFootX = lerp(leg.renderFootX, leg.footX, 0.2);
            leg.renderFootY = lerp(leg.renderFootY, leg.footY, 0.2);
            leg.renderLiftHeight = lerp(leg.renderLiftHeight, 0, 0.2);
        });
        return;
    }

    const mouseDx = targetMouse.x - prevMouse.x;
    const mouseDy = targetMouse.y - prevMouse.y;
    const instantSpeed = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy) / Math.max(deltaTime, 0.016);

    prevMouse.x = targetMouse.x;
    prevMouse.y = targetMouse.y;

    smoothSpeed = lerp(smoothSpeed, instantSpeed, 0.1);
    creatureSpeed = Math.min(smoothSpeed / 800, 1);

    const idleBlend = Math.min(creatureSpeed / 0.12, 1);

    const followSpeed = lerp(0.1, 0.3, creatureSpeed);
    const mouseSmooth = lerp(0.1, 0.4, creatureSpeed);

    mouse.x = lerp(mouse.x, targetMouse.x, mouseSmooth);
    mouse.y = lerp(mouse.y, targetMouse.y, mouseSmooth);

    const head = spineSegments[0];
    const dx = mouse.x - head.x;
    const dy = mouse.y - head.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const targetAngle = Math.atan2(dy, dx);

    const maxTurnRate = lerp(0.03, 0.08, creatureSpeed);
    const angleDelta = angleDiff(head.angle, targetAngle);
    const clampedDelta = Math.max(-maxTurnRate, Math.min(maxTurnRate, angleDelta));
    head.angle = normalizeAngle(head.angle + clampedDelta);

    const oldX = head.x;
    const oldY = head.y;

    if (dist > 5) {
        const moveSpeed = Math.min(dist * followSpeed, dist);
        const facingWeight = lerp(0.3, 0.7, creatureSpeed);
        const moveAngle = head.angle * facingWeight + targetAngle * (1 - facingWeight);
        head.x += Math.cos(moveAngle) * moveSpeed;
        head.y += Math.sin(moveAngle) * moveSpeed;
    }

    head.x = Math.max(boundaryPadding, Math.min(canvas.width - boundaryPadding, head.x));
    head.y = Math.max(boundaryPadding, Math.min(canvas.height - boundaryPadding, head.y));

    if (creatureSpeed > 0.1) {
        const wiggle = Math.sin(globalGaitPhase * 2) * 1.5 * creatureSpeed;
        const perp = head.angle + Math.PI / 2;
        head.x += Math.cos(perp) * wiggle;
        head.y += Math.sin(perp) * wiggle;
    }

    bodyVelocity.x = lerp(bodyVelocity.x, head.x - oldX, 0.6);
    bodyVelocity.y = lerp(bodyVelocity.y, head.y - oldY, 0.6);

    const segmentSmooth = lerp(0.5, 0.8, creatureSpeed);

    const maxBendAngle = Math.PI * 0.15;

    for (let i = 1; i < spineSegments.length; i++) {
        const seg = spineSegments[i];
        const prev = spineSegments[i - 1];

        const idealAngle = prev.angle + Math.PI;
        let currentAngle = Math.atan2(seg.y - prev.y, seg.x - prev.x);

        const bendFromIdeal = angleDiff(idealAngle, currentAngle);
        let constrainedAngle = currentAngle;
        if (Math.abs(bendFromIdeal) > maxBendAngle) {
            constrainedAngle = normalizeAngle(idealAngle + Math.sign(bendFromIdeal) * maxBendAngle);
        }

        const targetX = prev.x + Math.cos(constrainedAngle) * spineSpacing;
        const targetY = prev.y + Math.sin(constrainedAngle) * spineSpacing;

        const time = now * 0.003;
        const waveAmount = lerp(0.1, 0.8, creatureSpeed) * idleBlend;
        const waveFreq = lerp(0.6, 2, creatureSpeed);
        const perpAngle = prev.angle + Math.PI / 2;
        const wave = Math.sin(time * waveFreq + i * 0.4) * waveAmount * (i / spineSegments.length);

        const waveX = Math.cos(perpAngle) * wave;
        const waveY = Math.sin(perpAngle) * wave;

        seg.x = lerp(seg.x, targetX + waveX, 0.7);
        seg.y = lerp(seg.y, targetY + waveY, 0.7);

        seg.angle = Math.atan2(prev.y - seg.y, prev.x - seg.x);
    }

    const minSegmentDist = spineSpacing * 0.8;
    for (let i = 0; i < spineSegments.length; i++) {
        for (let j = i + 2; j < spineSegments.length; j++) {
            const a = spineSegments[i];
            const b = spineSegments[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minSegmentDist && dist > 0.1) {

                const overlap = minSegmentDist - dist;
                const pushX = (dx / dist) * overlap * 0.5;
                const pushY = (dy / dist) * overlap * 0.5;

                if (i > 0) {
                    a.x -= pushX;
                    a.y -= pushY;
                }
                b.x += pushX;
                b.y += pushY;
            }
        }
    }
}

let globalGaitPhase = 0;
let lastGaitSwitch = 0;

function updateLegs() {
    const time = Date.now() * 0.001;
    const bodySpeed = Math.sqrt(bodyVelocity.x ** 2 + bodyVelocity.y ** 2);

    const gaitSpeed = lerp(1.5, 8, creatureSpeed);
    const stepThreshold = lerp(25, 60, creatureSpeed);
    const stepSpeed = lerp(0.12, 0.3, creatureSpeed);
    const liftAmount = lerp(3, 12, creatureSpeed);

    if (creatureSpeed > 0.02) {
        globalGaitPhase += gaitSpeed * 0.016;
    }

    const gaitWave = Math.sin(globalGaitPhase);
    let activeGroup = lastGaitSwitch;
    if (gaitWave > 0.3) activeGroup = 0;
    else if (gaitWave < -0.3) activeGroup = 1;
    lastGaitSwitch = activeGroup;

    legs.forEach((leg) => {
        const spineSeg = spineSegments[leg.spineIndex];
        const reach = (leg.upperLen + leg.lowerLen) * 0.55;

        const perpAngle = spineSeg.angle + Math.PI / 2;
        const shoulderX = spineSeg.x + Math.cos(perpAngle) * leg.side * spineSeg.width * 0.4;
        const shoulderY = spineSeg.y + Math.sin(perpAngle) * leg.side * spineSeg.width * 0.4;

        const legAngle = perpAngle + leg.side * (Math.PI * 0.2);
        let idealX = spineSeg.x + Math.cos(legAngle) * leg.side * reach;
        let idealY = spineSeg.y + Math.sin(legAngle) * leg.side * reach;

        if (bodySpeed > 0.1) {
            const moveDir = Math.atan2(bodyVelocity.y, bodyVelocity.x);
            const anticipation = lerp(5, 20, creatureSpeed);
            idealX += Math.cos(moveDir) * anticipation;
            idealY += Math.sin(moveDir) * anticipation;
        }

        const footDx = idealX - leg.footX;
        const footDy = idealY - leg.footY;
        const footDist = Math.sqrt(footDx * footDx + footDy * footDy);

        const shoulderToFoot = Math.sqrt(
            Math.pow(leg.footX - shoulderX, 2) +
            Math.pow(leg.footY - shoulderY, 2)
        );
        const maxReach = leg.upperLen + leg.lowerLen - 5;

        const isMyTurn = leg.tripodGroup === activeGroup;

        const needsToStep = footDist > stepThreshold || shoulderToFoot > maxReach * 0.9;

        const critical = shoulderToFoot > maxReach;

        if ((needsToStep && isMyTurn && !leg.isMoving) || (critical && !leg.isMoving)) {
            leg.isMoving = true;
            leg.stepPhase = 0;
            leg.prevFootX = leg.footX;
            leg.prevFootY = leg.footY;
            leg.targetFootX = idealX;
            leg.targetFootY = idealY;
            leg.lastStepTime = time;
        }

        if (leg.isMoving) {
            leg.stepPhase += stepSpeed;

            if (leg.stepPhase >= 1) {
                leg.isMoving = false;
                leg.stepPhase = 1;
                leg.footX = leg.targetFootX;
                leg.footY = leg.targetFootY;
                leg.liftHeight = 0;
            } else {
                const t = leg.stepPhase;
                const easeT = 1 - Math.pow(1 - t, 3);

                leg.footX = lerp(leg.prevFootX, leg.targetFootX, easeT);
                leg.footY = lerp(leg.prevFootY, leg.targetFootY, easeT);

                leg.liftHeight = Math.sin(leg.stepPhase * Math.PI) * liftAmount;
            }
        } else {
            leg.liftHeight = 0;
        }

        if (shoulderToFoot > maxReach) {
            const angle = Math.atan2(leg.footY - shoulderY, leg.footX - shoulderX);
            const clampedX = shoulderX + Math.cos(angle) * maxReach;
            const clampedY = shoulderY + Math.sin(angle) * maxReach;
            leg.footX = lerp(leg.footX, clampedX, 0.5);
            leg.footY = lerp(leg.footY, clampedY, 0.5);
        }

        const renderSmooth = leg.isMoving ? 0.6 : 0.4;
        leg.renderFootX = lerp(leg.renderFootX, leg.footX, renderSmooth);
        leg.renderFootY = lerp(leg.renderFootY, leg.footY, renderSmooth);
        leg.renderLiftHeight = lerp(leg.renderLiftHeight, leg.liftHeight, 0.5);
    });
}

function drawBone(x1, y1, x2, y2, thickness, isLifted = false) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(length / 2, 3, length / 2 + 2, thickness / 2 + 1, 0, 0, Math.PI * 2);
    ctx.fill();

    const gradient = ctx.createLinearGradient(0, -thickness, 0, thickness);
    gradient.addColorStop(0, isLifted ? '#ffffff' : '#e8e8e8');
    gradient.addColorStop(0.3, isLifted ? '#f5f5f5' : '#d8d8d8');
    gradient.addColorStop(1, isLifted ? '#cccccc' : '#a0a0a0');

    ctx.fillStyle = gradient;
    ctx.beginPath();

    ctx.ellipse(4, 0, thickness * 0.7, thickness * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(length - 4, 0, thickness * 0.6, thickness * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(4, -thickness * 0.35, length - 8, thickness * 0.7, thickness * 0.3);
    ctx.fill();

    ctx.restore();
}

function drawJoint(x, y, radius) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2);
    ctx.fill();

    const gradient = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.5, '#d0d0d0');
    gradient.addColorStop(1, '#909090');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

let vhsTime = 0;
let glitchIntensity = 0;
let staticLines = [];

for (let i = 0; i < 5; i++) {
    staticLines.push({
        y: Math.random() * canvas.height,
        speed: Math.random() * 2 + 1,
        thickness: Math.random() * 3 + 1,
        opacity: Math.random() * 0.3
    });
}

function drawVHSBackground() {
    const bgGrad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.7
    );
    bgGrad.addColorStop(0, '#1a1520');
    bgGrad.addColorStop(0.5, '#0d0a12');
    bgGrad.addColorStop(1, '#050308');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    vhsTime += 0.016;

    if (Math.random() < 0.02) {
        glitchIntensity = Math.random() * 0.5;
    }
    glitchIntensity *= 0.95;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    staticLines.forEach(line => {
        line.y += line.speed;
        if (line.y > canvas.height) {
            line.y = -10;
            line.speed = Math.random() * 2 + 1;
        }
        ctx.globalAlpha = line.opacity;
        ctx.fillRect(0, line.y, canvas.width, line.thickness);
    });
    ctx.globalAlpha = 1;

    if (glitchIntensity > 0.1) {
        const numBars = Math.floor(glitchIntensity * 10);
        for (let i = 0; i < numBars; i++) {
            const y = Math.random() * canvas.height;
            const height = Math.random() * 5 + 2;
            ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,50,50' : '50,255,255'}, ${glitchIntensity * 0.3})`;
            ctx.fillRect(0, y, canvas.width, height);
        }
    }

    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    const date = new Date();
    ctx.fillText('REC ●', 20, 30);
    ctx.fillText(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`, canvas.width - 80, 30);

    const vignetteGrad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.9
    );
    vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignetteGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawVHSBackground();

    legs.forEach(leg => {
        const spineSeg = spineSegments[leg.spineIndex];

        const perpAngle = spineSeg.angle + Math.PI / 2;
        const shoulderX = spineSeg.x + Math.cos(perpAngle) * leg.side * spineSeg.width * 0.4;
        const shoulderY = spineSeg.y + Math.sin(perpAngle) * leg.side * spineSeg.width * 0.4;

        const footX = leg.renderFootX;
        const footY = leg.renderFootY - leg.renderLiftHeight;

        const bendDir = -leg.side;
        const ik = solveIK(shoulderX, shoulderY, footX, footY, leg.upperLen, leg.lowerLen, bendDir);

        const isLifted = leg.liftHeight > 2;

        drawJoint(shoulderX, shoulderY, 5);

        drawBone(shoulderX, shoulderY, ik.elbowX, ik.elbowY, 5, isLifted);

        drawJoint(ik.elbowX, ik.elbowY, 4);

        drawBone(ik.elbowX, ik.elbowY, footX, footY, 4, isLifted);

        ctx.save();
        ctx.translate(footX, footY);
        ctx.rotate(ik.lowerAngle);

        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(12, -3);
        ctx.lineTo(12, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    });

    for (let i = spineSegments.length - 1; i >= 0; i--) {
        const seg = spineSegments[i];

        if (i === 0) {
            ctx.save();
            ctx.translate(seg.x, seg.y);
            ctx.rotate(seg.angle);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.ellipse(3, 3, 22, 16, 0, 0, Math.PI * 2);
            ctx.fill();

            const skullGrad = ctx.createRadialGradient(-8, -6, 0, 0, 0, 25);
            skullGrad.addColorStop(0, '#ffffff');
            skullGrad.addColorStop(0.4, '#e8e8e8');
            skullGrad.addColorStop(1, '#a0a0a0');

            ctx.fillStyle = skullGrad;
            ctx.beginPath();
            ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.ellipse(8, -5, 5, 6, 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(8, 5, 5, 6, -0.2, 0, Math.PI * 2);
            ctx.fill();

            const eyeGlow = ctx.createRadialGradient(10, -5, 0, 10, -5, 6);
            eyeGlow.addColorStop(0, '#ff0000');
            eyeGlow.addColorStop(0.5, '#ff0000');
            eyeGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = eyeGlow;
            ctx.beginPath();
            ctx.arc(10, -5, 6, 0, Math.PI * 2);
            ctx.fill();

            const eyeGlow2 = ctx.createRadialGradient(10, 5, 0, 10, 5, 6);
            eyeGlow2.addColorStop(0, '#ff0000');
            eyeGlow2.addColorStop(0.5, '#ff0000');
            eyeGlow2.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = eyeGlow2;
            ctx.beginPath();
            ctx.arc(10, 5, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(10, -5, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(10, 5, 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#c0c0c0';
            for (let t = -3; t <= 3; t++) {
                ctx.beginPath();
                ctx.moveTo(18, t * 3);
                ctx.lineTo(25, t * 2.5);
                ctx.lineTo(18, t * 3 + 1.5);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        } else {
            const prev = spineSegments[i - 1];
            drawBone(seg.x, seg.y, prev.x, prev.y, seg.width * 0.4);

            drawJoint(seg.x, seg.y, seg.width * 0.35);

            if (i % 3 === 0 && i < spineSegments.length - 3) {
                const perpAngle = seg.angle + Math.PI / 2;

                [-1, 1].forEach(side => {
                    const ribLength = seg.width * 1.2;
                    const ribX = seg.x + Math.cos(perpAngle) * side * ribLength;
                    const ribY = seg.y + Math.sin(perpAngle) * side * ribLength;

                    ctx.strokeStyle = '#b0b0b0';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(seg.x, seg.y);
                    ctx.quadraticCurveTo(
                        seg.x + Math.cos(perpAngle + side * 0.3) * side * ribLength * 0.6,
                        seg.y + Math.sin(perpAngle + side * 0.3) * side * ribLength * 0.6,
                        ribX, ribY
                    );
                    ctx.stroke();
                });
            }
        }
    }
}

const footerText = document.getElementById('footer-text');
const footerChars = [];
let footerRect = null;
let footerInitialized = false;
let crackState = {};

function initFooter() {
    if (footerInitialized) return;

    const text = footerText.textContent;
    footerText.innerHTML = '';

    for (let i = 0; i < text.length; i++) {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = text[i] === ' ' ? '\u00A0' : text[i];
        span.style.setProperty('--crack-x', '0px');
        span.style.setProperty('--crack-y', '0px');
        span.style.setProperty('--crack-r', '0deg');
        footerText.appendChild(span);
        footerChars.push({
            element: span,
            cracked: false,
            crackTime: 0
        });
    }

    footerInitialized = true;
    updateFooterRect();
}

function updateFooterRect() {
    footerRect = footerText.getBoundingClientRect();
}

function checkFooterCollision() {
    if (!footerInitialized || !footerRect) return;

    if (Math.random() < 0.01) updateFooterRect();

    const now = Date.now();
    const creatureNearFooter = spineSegments.some(seg => {
        const segY = seg.y;
        const segX = seg.x;
        return segY > footerRect.top - 50 &&
            segY < footerRect.bottom + 50 &&
            segX > footerRect.left - 30 &&
            segX < footerRect.right + 30;
    });

    const legNearFooter = legs.some(leg => {
        return leg.renderFootY > footerRect.top - 30 &&
            leg.renderFootY < footerRect.bottom + 30 &&
            leg.renderFootX > footerRect.left - 20 &&
            leg.renderFootX < footerRect.right + 20;
    });

    const isNear = creatureNearFooter || legNearFooter;

    footerChars.forEach((charData, index) => {
        const charRect = charData.element.getBoundingClientRect();

        let directHit = false;
        let hitX = 0, hitY = 0;

        spineSegments.forEach(seg => {
            const dx = seg.x - (charRect.left + charRect.width / 2);
            const dy = seg.y - (charRect.top + charRect.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 40) {
                directHit = true;
                hitX = dx;
                hitY = dy;
            }
        });

        legs.forEach(leg => {
            const dx = leg.renderFootX - (charRect.left + charRect.width / 2);
            const dy = leg.renderFootY - (charRect.top + charRect.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 30) {
                directHit = true;
                hitX = dx;
                hitY = dy;
            }
        });

        if (directHit && !charData.cracked) {
            charData.cracked = true;
            charData.crackTime = now;

            const crackX = -Math.sign(hitX) * (Math.random() * 15 + 5);
            const crackY = Math.random() * 20 + 10;
            const crackR = (Math.random() - 0.5) * 40;

            charData.element.style.setProperty('--crack-x', `${crackX}px`);
            charData.element.style.setProperty('--crack-y', `${crackY}px`);
            charData.element.style.setProperty('--crack-r', `${crackR}deg`);

            charData.element.classList.remove('recovering');
            charData.element.classList.add('cracked');

            spawnCrackFragments(charRect.left + charRect.width / 2, charRect.top);

        } else if (charData.cracked && !isNear && now - charData.crackTime > 500) {

            charData.cracked = false;
            charData.element.classList.remove('cracked');
            charData.element.classList.add('recovering');

            setTimeout(() => {
                charData.element.classList.remove('recovering');
            }, 500);
        }
    });
}

function spawnCrackFragments(x, y) {
    const fragments = ['/', '\\', '|', '-', '*', '.', '`', "'"];
    const numFragments = Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < numFragments; i++) {
        const frag = document.createElement('span');
        frag.className = 'crack-fragment';
        frag.textContent = fragments[Math.floor(Math.random() * fragments.length)];
        frag.style.left = x + 'px';
        frag.style.top = y + 'px';
        frag.style.fontSize = (Math.random() * 8 + 8) + 'px';
        frag.style.setProperty('--frag-x', `${(Math.random() - 0.5) * 60}px`);
        frag.style.setProperty('--frag-y', `${Math.random() * 40 + 20}px`);
        frag.style.setProperty('--frag-r', `${(Math.random() - 0.5) * 180}deg`);

        document.body.appendChild(frag);

        setTimeout(() => {
            frag.remove();
        }, 800);
    }
}

setTimeout(initFooter, 100);

function animate() {
    updateSpine();
    updateLegs();
    draw();
    checkFooterCollision();
    requestAnimationFrame(animate);
}

animate();
