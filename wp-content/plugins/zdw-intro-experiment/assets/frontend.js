( function () {
	'use strict';

	function clampIntensity( value ) {
		var parsed = Number.parseFloat( value );
		return Number.isFinite( parsed ) ? Math.max( 0, Math.min( 100, parsed ) ) : 100;
	}

	function tryPlay( video ) {
		if ( ! video || typeof video.play !== 'function' ) {
			return;
		}

		video.muted = true;
		video.playsInline = true;
		var promise = video.play();
		if ( promise && typeof promise.catch === 'function' ) {
			promise.catch( function () {} );
		}
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
		tryPlay( video );
	}

	function setUpExperiment( root ) {
		var video = root.querySelector( '.ie-bg-video:not(.zdw-intro-video-base)' );
		if ( ! video ) {
			return;
		}

		var mode = root.getAttribute( 'data-effect-mode' ) || 'filter';
		var intensity = clampIntensity( root.getAttribute( 'data-effect-intensity' ) );
		var originalFilter = video.style.filter;

		root.classList.add( 'zdw-intro-experiment' );
		root.style.setProperty( '--zdw-intro-effect-intensity', String( intensity / 100 ) );

		if ( mode === 'overlay' ) {
			setUpColorOverlay( root, video );
			return;
		}

		video.classList.add( 'zdw-intro-video-filtered' );

		if ( mode === 'none' ) {
			video.style.setProperty( 'filter', 'none' );
			video.style.setProperty( 'opacity', '1' );
			tryPlay( video );
			return;
		}

		if ( intensity <= 0 || ! originalFilter || originalFilter === 'none' ) {
			video.style.setProperty( 'filter', 'none' );
			video.style.setProperty( 'opacity', '1' );
			tryPlay( video );
			return;
		}

		if ( intensity >= 100 ) {
			video.style.setProperty( 'filter', originalFilter );
			video.style.setProperty( 'opacity', '1' );
			tryPlay( video );
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

		tryPlay( baseVideo );
		tryPlay( video );
	}

	document.querySelectorAll( '.intro-effect[data-effect-mode]' ).forEach( setUpExperiment );
} )();
