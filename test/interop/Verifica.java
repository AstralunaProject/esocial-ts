import java.io.ByteArrayInputStream;
import java.io.File;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Base64;
import javax.xml.XMLConstants;
import javax.xml.crypto.dsig.XMLSignature;
import javax.xml.crypto.dsig.XMLSignatureFactory;
import javax.xml.crypto.dsig.dom.DOMValidateContext;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.SchemaFactory;
import org.w3c.dom.Document;

/**
 * Confere com as implementações de referência do JDK (XMLDSig e Xerces) o que o esocial-ts gera.
 * Uso: java Verifica.java <evento-assinado.xml> <evento.xsd>
 */
public class Verifica {
  public static void main(String[] args) throws Exception {
    DocumentBuilderFactory fabrica = DocumentBuilderFactory.newInstance();
    fabrica.setNamespaceAware(true);
    Document doc = fabrica.newDocumentBuilder().parse(new File(args[0]));

    String base64 = doc.getElementsByTagNameNS(XMLSignature.XMLNS, "X509Certificate").item(0).getTextContent().replaceAll("\\s", "");
    X509Certificate certificado = (X509Certificate) CertificateFactory.getInstance("X.509")
        .generateCertificate(new ByteArrayInputStream(Base64.getDecoder().decode(base64)));
    DOMValidateContext contexto = new DOMValidateContext(certificado.getPublicKey(), doc.getElementsByTagNameNS(XMLSignature.XMLNS, "Signature").item(0));
    boolean assinaturaValida = XMLSignatureFactory.getInstance("DOM").unmarshalXMLSignature(contexto).validate(contexto);

    SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI).newSchema(new File(args[1])).newValidator().validate(new StreamSource(new File(args[0])));

    System.out.println((assinaturaValida ? "assinatura valida" : "assinatura INVALIDA") + ", XSD valido: " + args[0]);
    if (!assinaturaValida) System.exit(1);
  }
}
