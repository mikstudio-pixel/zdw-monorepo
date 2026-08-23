( function () {
	'use strict';

	var header = document.querySelector( '.zdw-two-tier' );
	if ( ! header ) {
		return;
	}

	var trigger = header.querySelector( '.zdw-two-tier__trigger' );
	var panel = header.querySelector( '.zdw-two-tier__mobile-panel' );
	if ( ! trigger || ! panel ) {
		return;
	}

	function setOpen( open ) {
		header.classList.toggle( 'is-open', open );
		trigger.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
		panel.hidden = ! open;
	}

	trigger.addEventListener( 'click', function () {
		setOpen( ! header.classList.contains( 'is-open' ) );
	} );

	document.addEventListener( 'keydown', function ( event ) {
		if ( 'Escape' === event.key && header.classList.contains( 'is-open' ) ) {
			setOpen( false );
			trigger.focus();
		}
	} );

	window.addEventListener( 'resize', function () {
		if ( window.innerWidth >= 1120 && header.classList.contains( 'is-open' ) ) {
			setOpen( false );
		}
	}, { passive: true } );
} )();
