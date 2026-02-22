import Phaser from 'phaser';

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 360,
    height: 640,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    render: {
        pixelArt: true,
        antialias: false
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

function preload() {}

function create() {
    this.isGameOver = false;
    this.isVictory = false;

    createTextures(this);

    // Space background
    this.add.rectangle(180, 320, 360, 640, 0x000011);

    // Static stars
    for (let i = 0; i < 80; i++) {
        const x = Phaser.Math.Between(0, 360);
        const y = Phaser.Math.Between(0, 640);
        this.add.image(x, y, 'star');
    }

    // Moon surface
    this.ground = this.add.tileSprite(180, 610, 360, 60, 'ground');
    this.physics.add.existing(this.ground, true);

    // Dome
    this.dome = this.add.sprite(180, 580, 'dome');
    this.dome.setOrigin(0.5, 1);
    this.physics.add.existing(this.dome, true);
    this.dome.hits = 0;
    // Persistent graphics layer for accumulating cracks
    this.crackGraphics = this.add.graphics();
    this.crackGraphics.setPosition(180 - 80, 580 - 80);

    // Saucer
    this.saucer = this.physics.add.sprite(180, 150, 'saucer');
    this.saucer.setCollideWorldBounds(true);

    // Controls - track target position for smooth movement
    this.saucerTarget = { x: this.saucer.x, y: this.saucer.y };
    this.input.on('pointermove', (pointer) => {
        if (this.isGameOver) return;
        if (pointer.isDown) {
            this.saucerTarget.x = pointer.x;
            this.saucerTarget.y = pointer.y;
        }
    });
    this.input.on('pointerdown', (pointer) => {
        if (this.isGameOver) return;
        this.saucerTarget.x = pointer.x;
        this.saucerTarget.y = pointer.y;
    });

    // Bombing timer
    this.bombs = this.physics.add.group();
    this.time.addEvent({
        delay: 2500,
        callback: dropBomb,
        callbackScope: this,
        loop: true
    });

    // Missile timer
    this.missiles = this.physics.add.group();
    this.time.addEvent({
        delay: 4000,
        callback: launchMissile,
        callbackScope: this,
        loop: true
    });

    // Physics overlaps
    this.physics.add.overlap(this.bombs, this.dome, hitDome, null, this);
    this.physics.add.overlap(this.bombs, this.ground, hitGround, null, this);
    this.physics.add.overlap(this.missiles, this.saucer, hitSaucer, null, this);
    this.physics.add.overlap(this.missiles, this.ground, hitGround, null, this);

    this.titleText = this.add.text(180, 30, 'MOON MISSION', {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '20px',
        color: '#00ff00',
        stroke: '#000000',
        strokeThickness: 4
    }).setOrigin(0.5);

    // Scanlines for retro look
    for (let i = 0; i < 640; i += 4) {
        this.add.rectangle(180, i, 360, 2, 0x000000, 0.1).setDepth(1000);
    }
}

function update(time, delta) {
    // Smooth saucer movement — lerp toward target
    if (!this.isGameOver && !this.isVictory) {
        const lerpFactor = 1 - Math.pow(0.001, delta / 1000);
        this.saucer.x += (this.saucerTarget.x - this.saucer.x) * lerpFactor;
        this.saucer.y += (this.saucerTarget.y - this.saucer.y) * lerpFactor;
    }

    this.missiles.getChildren().forEach(missile => {
        if (!this.isGameOver && !this.isVictory) {
            const angle = Phaser.Math.Angle.Between(missile.x, missile.y, this.saucer.x, this.saucer.y);
            missile.setAcceleration(Math.cos(angle) * 120, Math.sin(angle) * 120);
            missile.setMaxVelocity(180);
            missile.rotation = Math.atan2(missile.body.velocity.y, missile.body.velocity.x);
        } else {
            missile.setAcceleration(0, 0);
            missile.rotation = Math.atan2(missile.body.velocity.y, missile.body.velocity.x);
        }
    });

    if (this.updateBanner) {
        this.updateBanner();
    }
}

function dropBomb() {
    if (this.isGameOver || this.isVictory) return;
    const bomb = this.bombs.create(this.saucer.x, this.saucer.y + 20, 'bomb');
    bomb.setVelocityY(300);
}

function launchMissile() {
    if (this.isGameOver || this.isVictory) return;
    const x = 180 + (Math.random() > 0.5 ? 60 : -60);
    const missile = this.missiles.create(x, 540, 'missile');
    missile.setVelocityY(-100);
}

function hitDome(dome, bomb) {
    bomb.destroy();
    if (this.isVictory) return;

    this.dome.hits++;
    // Draw new crack lines that accumulate on top of existing ones
    this.crackGraphics.lineStyle(2, 0x444444, 1);
    const numLines = 2 + this.dome.hits;
    for (let j = 0; j < numLines; j++) {
        this.crackGraphics.lineBetween(
            Phaser.Math.Between(30, 130),
            Phaser.Math.Between(10, 70),
            Phaser.Math.Between(30, 130),
            Phaser.Math.Between(10, 70)
        );
    }

    if (this.dome.hits >= 5) {
        startVictory(this);
    }
}

function hitGround(ground, projectile) {
    projectile.destroy();
}

function hitSaucer(saucer, missile) {
    missile.destroy();
    if (this.isGameOver || this.isVictory) return;

    explodeSaucer(this);
}

function explodeSaucer(scene) {
    scene.isGameOver = true;
    scene.saucer.setVisible(false);
    scene.saucer.body.enable = false;

    const p = scene.add.particles(0, 0, 'star', {
        x: scene.saucer.x,
        y: scene.saucer.y,
        speed: { min: 50, max: 200 },
        angle: { min: 0, max: 360 },
        scale: { start: 3, end: 0 },
        lifespan: 1000,
        gravityY: 100,
        quantity: 20,
        emitting: false
    });
    p.explode();

    scene.time.delayedCall(2000, respawnSaucer, [], scene);
}

function respawnSaucer() {
    this.isGameOver = false;
    this.saucer.setPosition(-50, 150);
    this.saucer.setVisible(true);
    this.saucer.body.enable = true;

    this.tweens.add({
        targets: this.saucer,
        x: 180,
        duration: 1000,
        ease: 'Power2'
    });
}

function startVictory(scene) {
    if (scene.isVictory) return;
    scene.isVictory = true;
    scene.dome.setVisible(false);
    scene.crackGraphics.setVisible(false);

    // Self-destruct all missiles
    scene.missiles.getChildren().forEach(missile => {
        const p = scene.add.particles(0, 0, 'star', {
            x: missile.x,
            y: missile.y,
            speed: { min: 30, max: 120 },
            angle: { min: 0, max: 360 },
            scale: { start: 2, end: 0 },
            lifespan: 600,
            quantity: 10,
            emitting: false
        });
        p.explode();
    });
    scene.missiles.clear(true, true);

    scene.add.sprite(180, 586, 'cake').setOrigin(0.5, 1);

    // Fireworks
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
    scene.time.addEvent({
        delay: 600,
        repeat: 20,
        callback: () => {
            const x = Phaser.Math.Between(50, 310);
            const y = Phaser.Math.Between(100, 400);
            const color = Phaser.Utils.Array.GetRandom(colors);

            const p = scene.add.particles(0, 0, 'star', {
                x: x,
                y: y,
                speed: { min: 60, max: 180 },
                angle: { min: 0, max: 360 },
                scale: { start: 3, end: 0 },
                lifespan: 1000,
                quantity: 40,
                tint: color,
                emitting: false
            });
            p.explode();
        },
        callbackScope: scene
    });

    // Animate UFO to center of screen
    scene.tweens.add({
        targets: scene.saucer,
        x: 180,
        y: 280,
        duration: 2500,
        ease: 'Power2'
    });

    // Banner — unfurls downward from the saucer
    const bannerRestOffset = 100;
    const banner = scene.add.container(scene.saucer.x, scene.saucer.y);
    const bg = scene.add.image(0, 25, 'banner_base').setOrigin(0.5, 0.5);
    const text = scene.add.text(0, 25, 'HAPPY BIRTHDAY!', {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '24px',
        color: '#ff0000',
        fontWeight: 'bold'
    }).setOrigin(0.5);
    banner.add([bg, text]);
    banner.bannerOffset = 10;
    banner.scaleY = 0;

    const string = scene.add.graphics();

    // Unfurl: scale from 0 to 1 vertically while dropping down
    scene.tweens.add({
        targets: banner,
        scaleY: 1,
        bannerOffset: bannerRestOffset,
        duration: 1800,
        ease: 'Power2'
    });

    let bannerTime = 0;
    scene.updateBanner = () => {
        bannerTime += 0.03;
        const undulateX = Math.sin(bannerTime * 2) * 6;
        const undulateY = Math.cos(bannerTime * 3) * 3;

        banner.x = scene.saucer.x + undulateX;
        banner.y = scene.saucer.y + banner.bannerOffset + undulateY;
        banner.rotation = Math.sin(bannerTime * 1.5) * 0.05;

        string.clear();
        string.lineStyle(2, 0xffffff, 1);
        string.lineBetween(scene.saucer.x, scene.saucer.y, banner.x, banner.y);
    };

    // Hide the title text on victory
    scene.titleText.setVisible(false);
}

function createTextures(scene) {
    let graphics = scene.make.graphics({ x: 0, y: 0, add: false });

    // Star
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(0, 0, 2, 2);
    graphics.generateTexture('star', 2, 2);
    graphics.clear();

    // Ground (irregular moon surface)
    graphics.fillStyle(0x777777, 1);
    graphics.fillRect(0, 0, 120, 60);
    // Varied surface patches
    graphics.fillStyle(0x888888, 1);
    graphics.fillRect(0, 0, 120, 3);
    graphics.fillStyle(0x6a6a6a, 1);
    graphics.fillRect(10, 3, 25, 4);
    graphics.fillRect(70, 2, 15, 5);
    graphics.fillRect(45, 5, 20, 3);
    // Craters
    graphics.fillStyle(0x555555, 1);
    graphics.fillCircle(20, 25, 8);
    graphics.fillCircle(85, 35, 10);
    graphics.fillCircle(55, 18, 5);
    graphics.fillStyle(0x666666, 1);
    graphics.fillCircle(20, 24, 6);
    graphics.fillCircle(85, 34, 7);
    graphics.fillCircle(55, 17, 3);
    // Rocks and pebbles
    graphics.fillStyle(0x999999, 1);
    graphics.fillRect(42, 40, 5, 3);
    graphics.fillRect(100, 15, 4, 3);
    graphics.fillRect(8, 45, 3, 2);
    graphics.fillStyle(0x5a5a5a, 1);
    graphics.fillRect(30, 50, 7, 4);
    graphics.fillRect(75, 12, 6, 3);
    graphics.fillRect(105, 45, 5, 4);
    // Surface roughness
    graphics.fillStyle(0x6e6e6e, 1);
    graphics.fillRect(0, 8, 8, 2);
    graphics.fillRect(35, 12, 12, 2);
    graphics.fillRect(90, 6, 10, 2);
    graphics.fillRect(60, 48, 15, 2);
    graphics.generateTexture('ground', 120, 60);
    graphics.clear();

    // Saucer
    graphics.fillStyle(0x00ffff, 1);
    graphics.fillRect(8, 12, 32, 8);
    graphics.fillRect(12, 8, 24, 4);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(16, 4, 16, 4);
    graphics.fillStyle(0xff0000, 1);
    graphics.fillRect(12, 14, 4, 4);
    graphics.fillRect(32, 14, 4, 4);
    graphics.generateTexture('saucer', 48, 24);
    graphics.clear();

    // Dome
    graphics.fillStyle(0x999999, 1);
    graphics.beginPath();
    graphics.arc(80, 80, 80, Math.PI, 0, false);
    graphics.lineTo(160, 80);
    graphics.lineTo(0, 80);
    graphics.closePath();
    graphics.fillPath();
    graphics.fillStyle(0xbbbbbb, 1);
    graphics.fillCircle(50, 40, 10);
    graphics.generateTexture('dome', 160, 80);
    graphics.clear();

    // Bomb (classic round bomb with fuse)
    graphics.fillStyle(0x333333, 1);
    graphics.fillCircle(10, 14, 8);
    graphics.fillStyle(0x222222, 1);
    graphics.fillCircle(10, 14, 6);
    graphics.fillStyle(0x555555, 1);
    graphics.fillCircle(8, 11, 3);
    // Fuse stem
    graphics.fillStyle(0x666666, 1);
    graphics.fillRect(9, 2, 2, 6);
    // Fuse spark
    graphics.fillStyle(0xffff00, 1);
    graphics.fillCircle(10, 2, 2);
    graphics.fillStyle(0xffa500, 1);
    graphics.fillCircle(10, 1, 1);
    graphics.generateTexture('bomb', 20, 22);
    graphics.clear();

    // Missile
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(0, 2, 12, 4);
    graphics.fillStyle(0xff0000, 1);
    graphics.fillRect(10, 2, 4, 4);
    graphics.fillStyle(0xffa500, 1);
    graphics.fillRect(0, 0, 2, 8);
    graphics.generateTexture('missile', 14, 8);
    graphics.clear();

    // Cake (detailed with candles)
    // Bottom tier
    graphics.fillStyle(0x8B4513, 1);
    graphics.fillRect(10, 70, 100, 40);
    // Bottom tier frosting
    graphics.fillStyle(0xFFB6C1, 1);
    graphics.fillRect(10, 70, 100, 8);
    // Bottom tier drip details
    graphics.fillStyle(0xFF69B4, 1);
    graphics.fillRect(20, 78, 4, 6);
    graphics.fillRect(40, 78, 4, 8);
    graphics.fillRect(60, 78, 4, 5);
    graphics.fillRect(80, 78, 4, 7);
    graphics.fillRect(96, 78, 4, 6);
    // Top tier
    graphics.fillStyle(0x9B5523, 1);
    graphics.fillRect(25, 45, 70, 25);
    // Top tier frosting
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(25, 45, 70, 8);
    // Top tier drip details
    graphics.fillStyle(0xFFB6C1, 1);
    graphics.fillRect(30, 53, 3, 5);
    graphics.fillRect(50, 53, 3, 6);
    graphics.fillRect(70, 53, 3, 4);
    graphics.fillRect(85, 53, 3, 5);
    // Candles
    const candleColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
    const candleXPositions = [35, 48, 60, 72, 85];
    for (let c = 0; c < 5; c++) {
        graphics.fillStyle(candleColors[c], 1);
        graphics.fillRect(candleXPositions[c], 25, 4, 20);
        // Flame
        graphics.fillStyle(0xffff00, 1);
        graphics.fillRect(candleXPositions[c], 19, 4, 6);
        graphics.fillStyle(0xffa500, 1);
        graphics.fillRect(candleXPositions[c] + 1, 21, 2, 3);
    }
    // Plate
    graphics.fillStyle(0xcccccc, 1);
    graphics.fillRect(5, 110, 110, 4);
    graphics.generateTexture('cake', 120, 120);
    graphics.clear();

    // Banner (bigger)
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(0, 0, 240, 50);
    graphics.generateTexture('banner_base', 240, 50);
    graphics.clear();

}
