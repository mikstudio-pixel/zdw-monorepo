( function () {
	'use strict';

	function clampIntensity( value ) {
		var parsed = Number.parseFloat( value );
		return Number.isFinite( parsed ) ? Math.max( 0, Math.min( 100, parsed ) ) : 100;
	}

	function tryPlay( video ) {
		if ( ! video || typeof video.play !== 'function' ) {
			return Promise.resolve( false );
		}

		video.defaultMuted = true;
		video.muted = true;
		video.playsInline = true;
		video.autoplay = true;
		video.setAttribute( 'muted', '' );
		video.setAttribute( 'playsinline', '' );
		video.setAttribute( 'autoplay', '' );

		try {
			var promise = video.play();
			if ( promise && typeof promise.then === 'function' ) {
				return promise.then(
					function () { return true; },
					function () { return false; }
				);
			}
		} catch ( error ) {
			return Promise.resolve( false );
		}

		return Promise.resolve( ! video.paused );
	}

	function setUpPlaybackRecovery( videos ) {
		function playAll() {
			if ( document.hidden ) {
				return;
			}

			videos.forEach( function ( video ) {
				tryPlay( video );
			} );
		}

		videos.forEach( function ( video ) {
			video.addEventListener( 'loadedmetadata', playAll );
			video.addEventListener( 'canplay', playAll );
		} );
		window.addEventListener( 'pageshow', playAll );
		document.addEventListener( 'visibilitychange', playAll );

		[ 'pointerdown', 'touchstart', 'keydown' ].forEach( function ( eventName ) {
			document.addEventListener( eventName, playAll, { once: true, passive: true } );
		} );

		playAll();
	}

	function setUpColorOverlay( root, video ) {
		video.classList.remove( 'zdw-intro-video-filtered' );
		video.classList.add( 'zdw-intro-video-source' );
		video.style.setProperty( 'filter', 'none' );
		video.style.setProperty( 'opacity', '1' );

		var overlay = document.createElement( 'span' );
		overlay.className = 'zdw-intro-color-overlay';
		overlay.setAttribute( 'aria-hidden', 'true' );
		video.insertAdjacentElement( 'afterend', overlay );
	}

	function setUpExperiment( root ) {
		var video = root.querySelector( '.ie-bg-video:not(.zdw-intro-video-base)' );
		if ( ! video ) {
			return;
		}

		var mode = root.getAttribute( 'data-effect-mode' ) || 'filter';
		var intensity = clampIntensity( root.getAttribute( 'data-effect-intensity' ) );
		var originalFilter = video.style.filter;
		var videos = [ video ];

		root.classList.add( 'zdw-intro-experiment' );
		root.style.setProperty( '--zdw-intro-effect-intensity', String( intensity / 100 ) );

		if ( mode === 'overlay' ) {
			setUpColorOverlay( root, video );
			setUpPlaybackRecovery( videos );
			return;
		}

		video.classList.add( 'zdw-intro-video-filtered' );

		if ( mode === 'none' ) {
			video.style.setProperty( 'filter', 'none' );
			video.style.setProperty( 'opacity', '1' );
			setUpPlaybackRecovery( videos );
			return;
		}

		if ( intensity <= 0 || ! originalFilter || originalFilter === 'none' ) {
			video.style.setProperty( 'filter', 'none' );
			video.style.setProperty( 'opacity', '1' );
			setUpPlaybackRecovery( videos );
			return;
		}

		if ( intensity >= 100 ) {
			video.style.setProperty( 'filter', originalFilter );
			video.style.setProperty( 'opacity', '1' );
			setUpPlaybackRecovery( videos );
			return;
		}

		var baseVideo = video.cloneNode( true );
		baseVideo.classList.remove( 'zdw-intro-video-filtered' );
		baseVideo.classList.add( 'zdw-intro-video-base' );
		baseVideo.removeAttribute( 'id' );
		baseVideo.style.setProperty( 'filter', 'none' );
		baseVideo.style.setProperty( 'opacity', '1' );

		video.style.setProperty( 'filter', originalFilter );
		video.style.setProperty( 'opacity', String( intensity / 100 ) );
		video.parentNode.insertBefore( baseVideo, video );
		videos.unshift( baseVideo );

		function syncBaseVideo() {
			if (
				Number.isFinite( video.currentTime ) &&
				Math.abs( baseVideo.currentTime - video.currentTime ) > 0.12
			) {
				baseVideo.currentTime = video.currentTime;
			}
		}

		video.addEventListener( 'play', function () {
			syncBaseVideo();
			tryPlay( baseVideo );
		} );
		video.addEventListener( 'pause', function () {
			baseVideo.pause();
		} );
		video.addEventListener( 'seeked', syncBaseVideo );
		video.addEventListener( 'timeupdate', syncBaseVideo );

		if ( video.readyState >= 1 ) {
			syncBaseVideo();
		}

		setUpPlaybackRecovery( videos );
	}

	document.querySelectorAll( '.intro-effect[data-effect-mode]' ).forEach( setUpExperiment );
} )();
