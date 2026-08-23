<?php include get_template_directory() . '/blocks/newsletter.php'; ?>
<footer class="footer mt-2 has-dark-background-color" role="contentinfo">
    <?php include get_stylesheet_directory() . '/parts/footer-connect.php'; ?>
    <div class="container has-bg-color">
        <?php include get_stylesheet_directory() . '/parts/footer-legal.php'; ?>

        <?php if (is_user_logged_in()) { ?>
            <div class="footer-edit-link">
                <?php wp_reset_postdata();
                edit_post_link("Upravit tuto stránku"); ?>
            </div>
        <?php } ?>
    </div>
</footer>

<?php
$modalContent = zdw_get_modal_content();
if (!empty($modalContent)) :
    $closeLabel = function_exists('pll__') ? pll__('close') : __('Close', 'zdw-theme-child');
    ?>
    <div id="newsletter-modal">
        <div class="has-plus-background-color mt-2 newsletter-modal__content">
            <div class="modal-close">
                <img
                        src="<?php echo get_template_directory_uri() ?>/img/close.svg"
                        alt="<?php echo esc_attr($closeLabel) ?>"
                        title="<?php echo esc_attr($closeLabel) ?>"/>
            </div>
            <div class="newsletter-block">
                <div class="newsletter-block__title has-light-color">
                    <?php echo $modalContent ?>
                </div>
            </div>
        </div>
    </div>
<?php endif; ?>

</div>
<?php wp_footer(); ?>
<!-- GoOut -->
<?php if (209 == get_the_ID() || 1380 == get_the_ID()) { ?>
    <script src="https://partners.goout.net/cz-other/zlindesignweekcom.js"></script>
<?php } ?>
</body>

</html>
