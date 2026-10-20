( function () {
	'use strict';

	var config = window.ZDWIntroExperimentConfig || {};
	var allowedModes = [ 'none', 'filter', 'overlay' ];
	var allowedBlendModes = [ 'normal', 'screen', 'multiply', 'overlay', 'soft-light', 'color' ];

	function clampPercentage( value, fallback ) {
		var parsed = Number.parseFloat( value );
		return Number.isFinite( parsed ) ? Math.max( 0, Math.min( 100, parsed ) ) : fallback;
	}

	document.querySelectorAll( '.intro-effect' ).forEach( function ( root ) {
		if ( ! root.querySelector( '.ie-bg-video' ) ) {
			return;
		}

		var mode = allowedModes.includes( config.mode ) ? config.mode : 'filter';
		var filterIntensity = clampPercentage( config.filterIntensity, 0 );
		var overlayOpacity = clampPercentage( config.overlayOpacity, 25 );
		var blendMode = allowedBlendModes.includes( config.overlayBlendMode )
			? config.overlayBlendMode
			: 'normal';
		var overlayColor = /^#[0-9a-f]{6}$/i.test( config.overlayColor || '' )
			? config.overlayColor
			: '#4e2797';
		var plainTitle = config.plainTitle === true || config.plainTitle === 1 || config.plainTitle === '1';

		root.classList.add( 'zdw-intro-experiment' );
		root.setAttribute( 'data-effect-mode', mode );
		root.setAttribute( 'data-title-effect', plainTitle ? 'plain' : 'exclusion' );
		root.setAttribute( 'data-effect-intensity', String( filterIntensity ) );
		root.style.setProperty( '--zdw-intro-effect-intensity', String( filterIntensity / 100 ) );
		root.style.setProperty( '--zdw-intro-overlay-color', overlayColor );
		root.style.setProperty( '--zdw-intro-overlay-opacity', String( overlayOpacity / 100 ) );
		root.style.setProperty( '--zdw-intro-overlay-blend-mode', blendMode );

		// The original WebGL renderer stretches its texture to the block ratio.
		// Experimental modes keep one aspect-safe source video instead.
		root.setAttribute( 'data-apply-effect', '0' );
	} );
} )();
