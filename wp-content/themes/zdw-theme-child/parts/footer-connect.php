<?php
$footer_language = function_exists( 'pll_current_language' ) ? pll_current_language( 'slug' ) : 'cs';
$footer_is_english = 'en' === $footer_language;
?>
<section class="footer-connect" aria-labelledby="footer-connect-title">
	<div class="container">
		<div class="footer-connect__grid">
			<div class="footer-connect__details">
				<h2 id="footer-connect-title" class="footer-connect__title">
					<?php echo $footer_is_english ? 'Let’s connect' : 'Propojme se'; ?>
				</h2>
				<div class="footer-connect__contacts">
					<address class="footer-connect__contact">
						<p>
							<strong>Ondřej Staněk</strong><br>
							Project Manager &amp; Creative Director
						</p>
						<p>
							<a href="mailto:ondrej.stanek@zlindesignweek.com">ondrej.stanek@zlindesignweek.com</a><br>
							<a href="tel:+420731560687">+420 731 560 687</a>
						</p>
					</address>
					<address class="footer-connect__contact">
						<p>
							<?php if ( $footer_is_english ) { ?>
								Tomas Bata University in Zlín<br>
								Faculty of Multimedia Communications<br>
							<?php } else { ?>
								Univerzita Tomáše Bati ve Zlíně<br>
								Fakulta multimediálních komunikací<br>
							<?php } ?>
							Univerzitní 2431, 760 01 Zlín<br>
							IČ: 70883521<br>
							DIČ: CZ70883521
						</p>
					</address>
				</div>
			</div>
			<div class="footer-connect__social">
				<h2 class="footer-connect__title">
					<?php echo $footer_is_english ? 'Join us' : 'Buď u toho s námi'; ?>
				</h2>
				<nav class="footer-connect__social-links" aria-label="<?php echo esc_attr( $footer_is_english ? 'Social media' : 'Sociální sítě' ); ?>">
					<a href="https://www.instagram.com/zlindesignweek/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram"><span class="footer-connect__social-icon footer-connect__social-icon--instagram" aria-hidden="true"></span></a>
					<a href="https://www.facebook.com/zlindesignweek/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook"><span class="footer-connect__social-icon footer-connect__social-icon--facebook" aria-hidden="true"></span></a>
					<a href="https://cz.linkedin.com/company/zlin-design-week" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn"><span class="footer-connect__social-icon footer-connect__social-icon--linkedin" aria-hidden="true"></span></a>
					<a href="https://open.spotify.com/show/1pPljNQtw2TDujocPtkSON" target="_blank" rel="noopener noreferrer" aria-label="Spotify" title="Spotify"><span class="footer-connect__social-icon footer-connect__social-icon--spotify" aria-hidden="true"></span></a>
				</nav>
			</div>
		</div>
	</div>
</section>
