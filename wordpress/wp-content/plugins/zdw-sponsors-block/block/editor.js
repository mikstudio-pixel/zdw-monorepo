( function ( wp ) {
	'use strict';

	var el = wp.element.createElement;
	var Fragment = wp.element.Fragment;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var MediaUpload = wp.blockEditor.MediaUpload;
	var MediaUploadCheck = wp.blockEditor.MediaUploadCheck;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var Button = wp.components.Button;
	var PanelBody = wp.components.PanelBody;
	var RangeControl = wp.components.RangeControl;
	var useSelect = wp.data.useSelect;

	var sectionDefinitions = window.zdwSponsorsBlockConfig && Array.isArray( window.zdwSponsorsBlockConfig.sections )
		? window.zdwSponsorsBlockConfig.sections
		: [];

	function LogoItem( props ) {
		var item = useSelect( function ( select ) {
			return select( 'core' ).getMedia( props.id );
		}, [ props.id ] );
		var src = item && item.media_details && item.media_details.sizes && item.media_details.sizes.thumbnail
			? item.media_details.sizes.thumbnail.source_url
			: item && item.source_url;

		return el(
			'div',
			{ className: 'zdw-sponsors-editor__logo' },
			src
				? el( 'img', { src: src, alt: item && item.alt_text ? item.alt_text : '' } )
				: el( 'span', {}, 'Načítám…' )
		);
	}

	function Edit( props ) {
		var attributes = props.attributes;
		var sections = attributes.sections || {};
		var blockProps = useBlockProps( { className: 'zdw-sponsors-editor' } );

		function updateSection( key, media ) {
			var next = Object.assign( {}, sections );
			next[ key ] = ( media || [] ).map( function ( item ) {
				return item.id;
			} );
			props.setAttributes( { sections: next } );
		}

		function rangeControl( attribute, label, min, max, step ) {
			return el( RangeControl, {
				label: label,
				value: attributes[ attribute ],
				min: min,
				max: max,
				step: step,
				onChange: function ( value ) {
					var change = {};
					change[ attribute ] = value;
					props.setAttributes( change );
				}
			} );
		}

		return el(
			Fragment,
			null,
			el(
				InspectorControls,
				null,
				el(
					PanelBody,
					{ title: 'Odsazení bloku', initialOpen: true },
					rangeControl( 'paddingTop', 'Horní padding – desktop (px)', 0, 240, 8 ),
					rangeControl( 'paddingBottom', 'Dolní padding – desktop (px)', 0, 240, 8 ),
					rangeControl( 'paddingTopMobile', 'Horní padding – mobil (px)', 0, 160, 8 ),
					rangeControl( 'paddingBottomMobile', 'Dolní padding – mobil (px)', 0, 160, 8 )
				),
				el(
					PanelBody,
					{ title: 'Mezery', initialOpen: false },
					rangeControl( 'sectionGap', 'Mezera mezi sekcemi (px)', 0, 200, 8 ),
					rangeControl( 'titleGap', 'Mezera mezi nadpisem a logy (px)', 0, 80, 4 ),
					rangeControl( 'logoGap', 'Vodorovná mezera mezi logy (px)', 0, 80, 4 ),
					rangeControl( 'logoRowGap', 'Svislá mezera mezi řádky log (px)', 0, 80, 4 )
				)
			),
			el(
				'div',
				blockProps,
				el(
					'div',
					{ className: 'zdw-sponsors-editor__header' },
					el( 'strong', {}, 'ZDW / Sponzoři' ),
					el( 'span', {}, 'Pořadí sekcí je shodné s původním seznamem.' )
				),
				sectionDefinitions.map( function ( definition ) {
					var key = definition[ 0 ];
					var title = definition[ 1 ];
					var ids = sections[ key ] || [];

					return el(
						'section',
						{ className: 'zdw-sponsors-editor__section', key: key },
						el( 'h3', {}, title ),
						ids.length
							? el(
								'div',
								{ className: 'zdw-sponsors-editor__logos' },
								ids.map( function ( id ) {
									return el( LogoItem, { id: id, key: id } );
								} )
							)
							: el( 'p', { className: 'zdw-sponsors-editor__empty' }, 'Zatím nejsou vybraná žádná loga.' ),
						el(
							'div',
							{ className: 'zdw-sponsors-editor__actions' },
							el(
								MediaUploadCheck,
								null,
								el( MediaUpload, {
									onSelect: function ( media ) { updateSection( key, media ); },
									allowedTypes: [ 'image' ],
									multiple: true,
									gallery: true,
									addToGallery: true,
									value: ids,
									render: function ( mediaProps ) {
										return el(
											Button,
											{ variant: 'secondary', onClick: mediaProps.open },
											ids.length ? 'Upravit výběr a pořadí' : 'Vybrat loga'
										);
									}
								} )
							),
							ids.length
								? el(
									Button,
									{ isDestructive: true, variant: 'tertiary', onClick: function () { updateSection( key, [] ); } },
									'Vymazat sekci'
								)
								: null
						)
					);
				} )
			)
		);
	}

	wp.blocks.registerBlockType( 'zdw/sponsors', {
		title: 'ZDW / Sponzoři',
		icon: 'groups',
		category: 'zdw',
		attributes: {
			sections: { type: 'object', default: {} },
			paddingTop: { type: 'number', default: 64 },
			paddingBottom: { type: 'number', default: 64 },
			paddingTopMobile: { type: 'number', default: 32 },
			paddingBottomMobile: { type: 'number', default: 32 },
			sectionGap: { type: 'number', default: 80 },
			titleGap: { type: 'number', default: 12 },
			logoGap: { type: 'number', default: 0 },
			logoRowGap: { type: 'number', default: 0 }
		},
		edit: Edit,
		save: function () {
			return null;
		}
	} );
} )( window.wp );
