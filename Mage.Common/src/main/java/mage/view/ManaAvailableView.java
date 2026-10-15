package mage.view;

import mage.Mana;
import mage.abilities.mana.ManaOptions;

import java.io.Serializable;

/**
 * The most mana a player could make right now, summed up for the web client's mana readout: the largest total any
 * one way of tapping gives, and for each colour the most of it any way gives ({@code any} is mana of a colour the
 * player picks, such as Command Tower's). Ways of tapping exclude each other, so the colours needn't add up to the
 * total.
 */
public class ManaAvailableView implements Serializable {

    private static final long serialVersionUID = 1L;

    private final int total;
    private final int white;
    private final int blue;
    private final int black;
    private final int red;
    private final int green;
    private final int colorless;
    private final int any;

    public ManaAvailableView(ManaOptions options) {
        int total = 0, white = 0, blue = 0, black = 0, red = 0, green = 0, colorless = 0, any = 0;
        for (Mana mana : options) {
            total = Math.max(total, mana.count());
            white = Math.max(white, mana.getWhite());
            blue = Math.max(blue, mana.getBlue());
            black = Math.max(black, mana.getBlack());
            red = Math.max(red, mana.getRed());
            green = Math.max(green, mana.getGreen());
            colorless = Math.max(colorless, mana.getColorless());
            any = Math.max(any, mana.getAny());
        }
        this.total = total;
        this.white = white;
        this.blue = blue;
        this.black = black;
        this.red = red;
        this.green = green;
        this.colorless = colorless;
        this.any = any;
    }

    public int getTotal() {
        return total;
    }

    public int getWhite() {
        return white;
    }

    public int getBlue() {
        return blue;
    }

    public int getBlack() {
        return black;
    }

    public int getRed() {
        return red;
    }

    public int getGreen() {
        return green;
    }

    public int getColorless() {
        return colorless;
    }

    public int getAny() {
        return any;
    }
}
