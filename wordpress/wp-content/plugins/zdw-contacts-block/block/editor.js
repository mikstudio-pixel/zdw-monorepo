( function ( wp ) {
	'use strict';

	var el = wp.element.createElement;
	var Fragment = wp.element.Fragment;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var Button = wp.components.Button;
	var PanelBody = wp.components.PanelBody;
	var SelectControl = wp.components.SelectControl;
	var TextControl = wp.components.TextControl;
	var decodeEntities = wp.htmlEntities.decodeEntities;

	function emptyContact() {
		return { section: '', name: '', role: '', email: '', phone: '' };
	}

	function Edit( props ) {
		var attributes = props.attributes;
		var contacts = ( attributes.contacts || [] ).map( function ( contact ) {
			if ( contact.section !== 'Programme Directors' ) {
				return contact;
			}

			return Object.assign( {}, contact, { section: 'Festival Management' } );
		} );
		var variant = attributes.variant === 'compact' ? 'compact' : 'grid';
		var blockProps = useBlockProps( { className: 'zdw-contacts-editor' } );

		function setContacts( next ) {
			props.setAttributes( { contacts: next } );
		}

		function updateContact( index, key, value ) {
			var next = contacts.map( function ( contact, contactIndex ) {
				if ( contactIndex !== index ) {
					return contact;
				}

				return Object.assign( {}, contact, ( function () {
					var change = {};
					change[ key ] = value;
					return change;
				} )() );
			} );
			setContacts( next );
		}

		function moveContact( index, direction ) {
			var target = index + direction;
			var next;
			var moved;

			if ( target < 0 || target >= contacts.length ) {
				return;
			}

			next = contacts.slice();
			moved = next.splice( index, 1 )[ 0 ];
			next.splice( target, 0, moved );
			setContacts( next );
		}

		function removeContact( index ) {
			setContacts( contacts.filter( function ( contact, contactIndex ) {
				return contactIndex !== index;
			} ) );
		}

		return el(
			Fragment,
			null,
			el(
				InspectorControls,
				null,
				el(
					PanelBody,
					{ title: 'Zobrazení', initialOpen: true },
					el( SelectControl, {
						label: 'Varianta',
						value: variant,
						options: [
							{ label: 'Grid', value: 'grid' },
							{ label: 'Jednoduchá karta', value: 'compact' }
						],
						onChange: function ( value ) {
							props.setAttributes( { variant: value } );
						}
					} )
				)
			),
			el(
				'div',
				blockProps,
				el(
					'div',
					{ className: 'zdw-contacts-editor__header' },
					el( 'div', {}, el( 'strong', {}, 'ZDW / Kontakty' ), el( 'span', {}, 'Bez fotografií, stejné pořadí jako na webu.' ) ),
					el( Button, { variant: 'primary', onClick: function () { setContacts( contacts.concat( [ emptyContact() ] ) ); } }, 'Přidat kontakt' )
				),
				contacts.length
					? contacts.map( function ( contact, index ) {
						return el(
							'section',
							{ className: 'zdw-contacts-editor__card', key: index },
							el(
								'div',
								{ className: 'zdw-contacts-editor__card-heading' },
								el( 'strong', {}, ( index + 1 ) + '. ' + ( contact.name || 'Nový kontakt' ) ),
								el(
									'div',
									{ className: 'zdw-contacts-editor__actions' },
									el( Button, { size: 'small', variant: 'tertiary', disabled: index === 0, onClick: function () { moveContact( index, -1 ); } }, '↑' ),
									el( Button, { size: 'small', variant: 'tertiary', disabled: index === contacts.length - 1, onClick: function () { moveContact( index, 1 ); } }, '↓' ),
									el( Button, { size: 'small', variant: 'tertiary', isDestructive: true, onClick: function () { removeContact( index ); } }, 'Odstranit' )
								)
							),
							el(
								'div',
								{ className: 'zdw-contacts-editor__fields' },
								el( TextControl, { label: 'Sekce', help: 'Stejný název seskupí kontakty do jednoho sloupce.', __next40pxDefaultSize: true, value: decodeEntities( contact.section || '' ), onChange: function ( value ) { updateContact( index, 'section', value ); } } ),
								el( TextControl, { label: 'Jméno', __next40pxDefaultSize: true, value: decodeEntities( contact.name || '' ), onChange: function ( value ) { updateContact( index, 'name', value ); } } ),
								el( TextControl, { label: 'Pozice', __next40pxDefaultSize: true, value: decodeEntities( contact.role || '' ), onChange: function ( value ) { updateContact( index, 'role', value ); } } ),
								el( TextControl, { label: 'E-mail', type: 'email', __next40pxDefaultSize: true, value: contact.email || '', onChange: function ( value ) { updateContact( index, 'email', value ); } } ),
								el( TextControl, { label: 'Telefon', type: 'tel', __next40pxDefaultSize: true, value: contact.phone || '', onChange: function ( value ) { updateContact( index, 'phone', value ); } } )
							)
						);
					} )
					: el( 'p', { className: 'zdw-contacts-editor__empty' }, 'Zatím nejsou přidané žádné kontakty.' )
			)
		);
	}

	wp.blocks.registerBlockType( 'zdw/contacts', {
		apiVersion: 2,
		title: 'ZDW / Kontakty',
		icon: 'id-alt',
		category: 'zdw',
		attributes: {
			contacts: { type: 'array', default: [] },
			variant: { type: 'string', default: 'grid' }
		},
		edit: Edit,
		save: function () {
			return null;
		}
	} );
} )( window.wp );
