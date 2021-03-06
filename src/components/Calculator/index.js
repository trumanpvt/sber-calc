import React, {useEffect, useState} from 'react';

import * as xlsx from "xlsx";
import {Checkbox, Input, message, Modal, Select} from 'antd';
import {PDFDownloadLink} from '@react-pdf/renderer'

import 'antd/dist/antd.css'
import './index.scss';
import {currencies, grade, risks} from "../../config";
import {
    createGuid,
    decryptKey,
    fetchProductsFromServer,
    getCurrencyRates,
    parseProductTypes,
    parseRatesJson,
    uploadNewProductsExcel
} from "../../util";

import uploadIcon from '../../assets/images/upload-file-icon.svg'
import downloadIcon from '../../assets/images/download-icon.svg'
import pdfIcon from '../../assets/images/pdf-icon.svg'
import PdfBriefcase from "../PdfBriefcase";

const {Option} = Select;

function Calculator() {

    const [totalSum, setTotalSum] = useState();
    const [clientRisk, setClientRisk] = useState();
    const [products, setProducts] = useState([]);
    const [productList, setProductList] = useState([]);
    const [productTypes, setProductTypes] = useState([]);
    const [sha, setSha] = useState();
    const [userPassword, setUserPassword] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [isUserModalVisible, setIsUserModalVisible] = useState(false);
    const [isAdminModalVisible, setIsAdminModalVisible] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [currencyRates, setCurrencyRates] = useState({});
    const [qualMode, setQualMode] = useState(false);

    useEffect(() => {

        getCurrencyRates().then(json => {

            if (json.Valute) {

                const currencyRatesParsed = parseRatesJson(json.Valute);

                setCurrencyRates(currencyRatesParsed);
            }
        })

    }, []);

    const handleGetProducts = () => {

        setIsUserModalVisible(true);
    }

    const handleOkUserPassword = () => {

        const key = decryptKey(userPassword, 'user');

        if (!key) {
            errorMessage('Неверный пароль');
            return null;
        }

        fetchProductsFromServer(key).then(data => {

            setSha(data.sha);
            setProductList(data.products);

            const types = parseProductTypes(data.products);
            setProductTypes(types);

            setUserPassword('');

            setIsUserModalVisible(false);

            successMessage('Продукты успешно загружены с сервера');
        });
    }

    const handleOkAdminPassword = () => {

        const key = decryptKey(adminPassword, 'admin');

        if (!key) {

            errorMessage('Неверный пароль');
            return null;
        }

        setIsAdminModalVisible(false);

        return setApiKey(key);
    }

    const handleCloseModal = (mode) => {

        if (mode === 'user') setIsUserModalVisible(false);
        else setIsAdminModalVisible(false);
    }

    const readUploadFile = (e) => {
        e.preventDefault();
        if (e.target.files) {

            const reader = new FileReader();
            reader.onload = (e) => {
                const data = e.target.result;
                const workbook = xlsx.read(data, {type: "array"});
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = xlsx.utils.sheet_to_json(worksheet);

                setProductList(json);

                const types = parseProductTypes(json);

                setProductTypes(types);

                if (sha) {

                    uploadExcel(json, sha);
                } else {

                    fetchProductsFromServer(apiKey).then(data => {

                        setSha(data.sha);

                        uploadExcel(json, data.sha);
                    })
                }
            };

            reader.readAsArrayBuffer(e.target.files[0]);
        }
    }

    const uploadExcel = (json, sha) => {

        uploadNewProductsExcel(json, sha, apiKey).then(() => {

            successMessage('Список продуктов успешно загружен на сервер');
        }).catch(e => {

            errorMessage(e);
        })
    }

    const getPortfolioRiskTextAndColorModifier = (portfolioRisk) => {

        let colorModifier;
        let riskText;

        if (clientRisk === portfolioRisk) {

            colorModifier = 'green';
            riskText = 'Риск соответствует вашему профилю';
        } else if (clientRisk < portfolioRisk) {

            colorModifier = 'red';
            riskText = 'Риск портфеля превышен';
        } else {

            colorModifier = 'gray';
            riskText = 'Вы недополучаете потенциальный доход';
        }

        return {
            colorModifier,
            riskText
        };
    }

    const renderPortfolioRiskText = (portfolioRisk) => {

        const textAndColor = getPortfolioRiskTextAndColorModifier(portfolioRisk);

        return (
            <div
                className={`calculator-main-body-numbers-text calculator-main-body-numbers-text_ + ${textAndColor.colorModifier}`}>
                {textAndColor.riskText}
            </div>
        );
    }

    const getPortfolioYield = (currency) => {

        const productsWithCurrency = products.filter(product => product.currency === currency);

        if (productsWithCurrency.length === 0 || !totalSum) {

            return 0;
        } else {

            const productsSum = productsWithCurrency.reduce((accumulator, product) => {

                const productValue = product['sum'] && product['neutr_scen'] ? product['sum'] * product['neutr_scen'] : 0;

                return accumulator + productValue;
            }, 0);

            if (currency === 'RUB') {

                return (productsSum / totalSum * 100).toFixed(2);
            } else {

                return (productsSum / (totalSum / currencyRates[currency]) * 100).toFixed(2);
            }
        }
    }

    const calcPortfolioRisk = () => {

        if (products.length === 0 || !totalSum) {

            return 0;
        } else {

            const productsSum = products.reduce((accumulator, product) => {

                let productValue;

                if (product['sum'] && product['stress_scen']) {

                    let productSum;

                    if (product['currency'] && product['currency'] !== 'RUB') {

                        productSum = product['sum'] * currencyRates[product['currency']];
                    } else {

                        productSum = product['sum'];
                    }

                    productValue = productSum * product['stress_scen'];
                } else {

                    productValue = 0;
                }
                return accumulator + productValue;
            }, 0);

            return getGradeRiskValue(Math.abs(productsSum / totalSum) * 100);
        }
    }

    const getPortfolioRisk = () => {

        const portfolioRisk = calcPortfolioRisk();

        return (
            <div className="calculator-main-body-numbers-number">
                <div className="calculator-main-body-numbers-number__title">
                    Риск рейтинг
                </div>
                <div className="calculator-main-body-numbers-number__value">
                    {`${portfolioRisk} из 5`}
                </div>
                <div className="calculator-main-body-numbers-text">
                    {clientRisk ? renderPortfolioRiskText(portfolioRisk) : ''}
                </div>
            </div>
        );
    }

    const handleRiskChange = (value) => {

        return setClientRisk(value);
    }

    const handleAddProduct = () => {

        const productsCopy = [...products];

        productsCopy.push({
            guid: createGuid(),
        });

        setProducts(productsCopy);
    }

    const calcMaxSumForProduct = (value, product) => {

        const valueRub = product['currency'] === 'RUB' ? value : value * currencyRates[product['currency']];

        const otherProducts = products.filter(item => {

            return item.guid !== product.guid;
        });

        const totalProductsSum = otherProducts.reduce((accumulator, item) => {

            if (item['currency'] === 'RUB') return accumulator + item['sum'];

            return accumulator + (item['sum'] * currencyRates[item['currency']]);
        }, 0);

        const sumDiff = totalSum - totalProductsSum;

        if (sumDiff < valueRub) value = product['currency'] === 'RUB' ? sumDiff : sumDiff / currencyRates[product['currency']];

        return Math.floor(value);
    }

    const handleProductChange = (value, product, field) => {

        const productsCopy = [...products];

        const index = productsCopy.findIndex(item => item.guid === product.guid);

        if (field === 'name') {

            const productFromList = productList.find(item => item.name === value);

            productsCopy[index] = {
                ...productsCopy[index], ...productFromList, [field]: value,
            }
        } else if (field === 'sum') {

            productsCopy[index] = {
                ...productsCopy[index],
                [field]: calcMaxSumForProduct(parseFloat(value), product),
            }
        } else {

            productsCopy[index] = {
                ...productsCopy[index],
                [field]: value,
            }
        }

        setProducts(productsCopy);
    }

    const filterProducts = (product) => {

        let products;

        if (!qualMode) {

            products = productList.filter(item => item['qual'] !== 1);
        } else {

            products = productList;
        }

        if (product.type) {

            products = products.filter(item => {
                return item.type === product.type;
            })
        }

        if (product.currency) {

            products = products.filter(item => {
                return item.currency === product.currency;
            })
        }

        return products;
    }

    const renderProductLeftSide = (product, index) => {

        const products = filterProducts(product);

        const productCurrency = currencies.find(currency => currency.name === product.currency);

        let currencySuffix;

        if (productCurrency) currencySuffix = productCurrency.suffix;

        return (
            <div className="calculator-products-left-body-product" key={index}>
                <Select
                    className="calculator-products-left-body-product__type"
                    onChange={(value) => handleProductChange(value, product, 'type')}
                    dropdownMatchSelectWidth={false}
                >
                    {productTypes.map((item, index) => {
                        return <Option key={index} value={item}>{item}</Option>
                    })}
                </Select>
                <Select
                    className="calculator-products-left-body-product__currency"
                    onChange={(value) => handleProductChange(value, product, 'currency')}
                    dropdownMatchSelectWidth={false}
                >
                    {currencies.map((item, index) => {
                        return <Option key={index} value={item.name}>{item.name}</Option>
                    })}
                </Select>
                <Select
                    className="calculator-products-left-body-product__name"
                    onChange={(value) => handleProductChange(value, product, 'name')}
                    dropdownMatchSelectWidth={false}
                >
                    {products.map((item, index) => {

                        return (<Option
                            key={index}
                            value={item.name}
                        >
                            {item.name} {(item.isin && item.isin !== 'NULL') || ''}
                        </Option>)
                    })}
                </Select>
                <Input
                    className="calculator-products-left-body-product__sum"
                    suffix={currencySuffix}
                    type="number"
                    value={product['sum']}
                    onChange={e => handleProductChange(e.target.value, product, 'sum')}
                />
            </div>
        );
    }

    const getGradeRiskValue = (stressScen) => {

        const gradeMatched = grade.find(item => {
            return stressScen >= item.min && stressScen <= item.max;
        });

        if (gradeMatched) return gradeMatched.value;

        return null;
    }

    const getProductPercentage = (productSum, currency, totalSum) => {

        let productSumConverted;

        if (currency === 'RUB') {

            productSumConverted = productSum;
        } else {

            productSumConverted = productSum * currencyRates[currency];
        }

        return (100 / (totalSum / productSumConverted)).toFixed(2)
    }

    const renderProductRightSide = (product, index) => {

        return (
            <div className="calculator-products-right-body-product" key={index}>
                <div className="calculator-products-right-body-product__value">
                    {product['sum'] && totalSum && product['currency'] ? getProductPercentage(product['sum'], product['currency'], totalSum) + '%' : ''}
                </div>
                <div className="calculator-products-right-body-product__value">
                    {product['product_risk_amt'] ? Math.round(product['product_risk_amt']) : ''}
                </div>
                <div className="calculator-products-right-body-product__value">
                    {product['neutr_scen'] ? (product['neutr_scen'] * 100).toFixed(2) + '%' : ''}
                </div>
            </div>
        );
    }

    const handleProductRemove = (index) => {

        const productsCopy = [...products];

        productsCopy.splice(index, 1);

        setProducts(productsCopy);
    }

    const successMessage = (text) => {
        message.success(text).then(() => null);
    };

    const errorMessage = (text) => {
        message.error(text).then(() => null);
    };

    const renderProductRemoveBtn = (product, index) => {

        return (<div
            className="calculator-products-remove-products__product"
            key={index}
            onClick={() => handleProductRemove(index)}
        />);
    }

    const handleCreatePdf = () => {

        return (
            <PdfBriefcase
                totalSum={totalSum}
                clientRisk={clientRisk}
                qualMode={qualMode}
                products={products}
                calcPortfolioRisk={calcPortfolioRisk}
                getPortfolioRiskTextAndColorModifier={getPortfolioRiskTextAndColorModifier}
                getPortfolioYield={getPortfolioYield}
                getProductPercentage={getProductPercentage}
                // getGradeRiskValue={getGradeRiskValue}
            />
        );
    }

    return (
        <div className="calculator-container">
            <div className="calculator-header">
                <div className="calculator-header__title">
                    Расчет
                </div>
                <div className="calculator-header-controls">
                    <PDFDownloadLink document={handleCreatePdf()} fileName="briefcase.pdf">
                        <img
                            className="calculator-header-controls__icon calculator-header-controls__icon_pdf"
                            src={pdfIcon}
                            alt=''
                        />
                    </PDFDownloadLink>
                    {apiKey ? (
                            <div className="calculator-header-controls__upload">
                                <Input
                                    type="file"
                                    name="upload"
                                    id="upload"
                                    onChange={readUploadFile}
                                />
                            </div>
                        )
                        : <img
                            className="calculator-header-controls__icon"
                            src={uploadIcon}
                            alt=''
                            onClick={() => setIsAdminModalVisible(true)}
                        />
                    }
                </div>
            </div>
            <div className="calculator-main">
                <div className="calculator-main__header">Параметры</div>
                <div className="calculator-main-body">
                    <div className="calculator-main-body-input">
                        <div className="calculator-main-body-input__title">Сумма</div>
                        <Input
                            className="calculator-main-body-input__input"
                            suffix='₽'
                            type="number"
                            value={totalSum}
                            onChange={(e => setTotalSum(e.target.value))}
                        />
                    </div>
                    <div className="calculator-main-body-input">
                        <div className="calculator-main-body-input__title">Инвестпрофиль</div>
                        <Select
                            className="calculator-main-body-input__select"
                            onChange={handleRiskChange}
                            value={clientRisk}
                        >
                            {risks.map((item, index) => {
                                return <Option key={index} value={item.value}>{item.title}</Option>
                            })}
                        </Select>
                    </div>
                    <div className="calculator-main-body-numbers">
                        {getPortfolioRisk()}
                        <div className="calculator-main-body-numbers-number">
                            <div className="calculator-main-body-numbers-number__title">
                                Доходность
                            </div>
                            <div className="calculator-main-body-numbers-number__value">
                                RUB - {getPortfolioYield('RUB')}%
                            </div>
                            <div className="calculator-main-body-numbers-number__value">
                                USD - {getPortfolioYield('USD')}%
                            </div>
                            <div className="calculator-main-body-numbers-number__value">
                                EUR - {getPortfolioYield('EUR')}%
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="calculator-buttons-container">
                <div className="calculator-buttons" onClick={handleGetProducts}>
                    <img className="calculator-buttons__icon" src={downloadIcon} alt=''/>
                    <div className="calculator-buttons__text">
                        Загрузить продукты с сервера
                    </div>
                </div>
                <div className="calculator-buttons-checkbox">
                    <Checkbox checked={qualMode} onChange={() => setQualMode(!qualMode)}>Режим КИ</Checkbox>
                </div>
                <div className="calculator-buttons" onClick={handleAddProduct}>
                    <div className="calculator-buttons__cross"/>
                    <div className="calculator-buttons__text">
                        Добавить продукт
                    </div>
                </div>
            </div>
            <div className="calculator-products">
                <div className="calculator-products-left">
                    <div className="calculator-products-left-header">
                        <div className="calculator-products-left-header__type">Тип</div>
                        <div className="calculator-products-left-header__currency">Валюта</div>
                        <div className="calculator-products-left-header__name">Название</div>
                        <div className="calculator-products-left-header__sum">Сумма</div>
                    </div>
                    <div className="calculator-products-left-body">
                        {products.map(renderProductLeftSide)}
                    </div>
                </div>
                <div className="calculator-products-right">
                    <div className="calculator-products-right-header">
                        <div className="calculator-products-right-header__title">Доля</div>
                        <div className="calculator-products-right-header__title">Риск</div>
                        <div className="calculator-products-right-header__title">Доход</div>
                    </div>
                    <div className="calculator-products-right-body">
                        {products.map(renderProductRightSide)}
                    </div>
                </div>
                <div className="calculator-products-remove-products">
                    {products.map(renderProductRemoveBtn)}
                </div>
            </div>
            <Modal visible={isUserModalVisible || isAdminModalVisible}
                   onOk={isUserModalVisible ? handleOkUserPassword : handleOkAdminPassword}
                   onCancel={isUserModalVisible ? () => handleCloseModal('user') : () => handleCloseModal('admin')}>
                <div className="calculator-products-right-header__title">Введите пароль</div>
                <Input
                    className="calculator-main-body-input__input"
                    value={isUserModalVisible ? userPassword : adminPassword}
                    type='password'
                    onChange={isUserModalVisible ? (e => setUserPassword(e.target.value)) : (e => setAdminPassword(e.target.value))}
                />
            </Modal>
        </div>
    );
}

export default Calculator;
