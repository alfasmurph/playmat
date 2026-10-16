package mage.players.net;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.ObjectStreamClass;

import static org.assertj.core.api.Assertions.assertThat;

class UserDataAvatarTest {

    @Test
    void aCardPicturesThePlayerOnlyWhenItReadsAsOne() {
        UserData data = UserData.getDefaultUserDataView();
        data.setAvatarCard("Ulalek, Fused Atrocity|MH3|211");
        assertThat(data.getAvatarCard()).isEqualTo("Ulalek, Fused Atrocity|MH3|211");
        data.setAvatarCard("Kefka, Court Mage // Kefka, Ruler of Ruin|FIN|231★");
        assertThat(data.getAvatarCard()).endsWith("|231★");
        for (String bad : new String[]{"no set", "a|b|c|d", "x\n|MH3|1", "x|MH3|<script>", null}) {
            data.setAvatarCard(bad);
            assertThat(data.getAvatarCard()).as(String.valueOf(bad)).isEmpty();
        }
    }

    @Test
    void theClientsUpdateCarriesItAndOldSavesStillRead() throws Exception {
        UserData sent = UserData.getDefaultUserDataView();
        sent.avatarCard = "Krenko, Mob Boss|M13|141";
        UserData kept = UserData.getDefaultUserDataView();
        kept.update(sent);
        assertThat(kept.getAvatarCard()).isEqualTo("Krenko, Mob Boss|M13|141");

        // saved games hold UserData: the class keeps the id it had before the field
        assertThat(ObjectStreamClass.lookup(UserData.class).getSerialVersionUID()).isEqualTo(7635686598380413484L);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(kept);
        }
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            assertThat(((UserData) in.readObject()).getAvatarCard()).isEqualTo("Krenko, Mob Boss|M13|141");
        }
    }
}
